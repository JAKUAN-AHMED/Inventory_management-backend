import { Router } from 'express';
import prisma from '../config/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware.js';
import { OrderStatus } from '@prisma/client';

const router = Router();

// Get dashboard metrics
router.get('/metrics', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's orders
    const todayOrders = await prisma.order.count({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    // Get pending orders
    const pendingOrders = await prisma.order.count({
      where: {
        userId,
        status: OrderStatus.PENDING,
      },
    });

    // Get completed orders (delivered)
    const completedOrders = await prisma.order.count({
      where: {
        userId,
        status: OrderStatus.DELIVERED,
      },
    });

    // Get low stock items (stockQuantity <= minStockThreshold)
    const allProducts = await prisma.product.findMany({
      where: { userId },
      select: { stockQuantity: true, minStockThreshold: true },
    });
    const lowStockItems = allProducts.filter(
      (p) => p.stockQuantity <= p.minStockThreshold
    ).length;

    // Get today's revenue
    const todayRevenueData = await prisma.order.aggregate({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          not: OrderStatus.CANCELLED,
        },
      },
      _sum: {
        totalPrice: true,
      },
    });

    const revenueToday = todayRevenueData._sum.totalPrice || 0;

    // Calculate revenue change (compare with previous day)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayRevenueData = await prisma.order.aggregate({
      where: {
        userId,
        createdAt: {
          gte: yesterday,
          lt: today,
        },
        status: {
          not: OrderStatus.CANCELLED,
        },
      },
      _sum: {
        totalPrice: true,
      },
    });

    const revenueYesterday = yesterdayRevenueData._sum.totalPrice || 0;
    const revenueChange = revenueYesterday > 0
      ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100
      : 0;

    res.json({
      success: true,
      data: {
        totalOrdersToday: todayOrders,
        pendingOrders,
        completedOrders,
        lowStockItems,
        revenueToday,
        revenueChange: Math.round(revenueChange * 100) / 100,
      },
    });
  } catch (error) {
    throw error;
  }
});

// Get product summary
router.get('/product-summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const products = await prisma.product.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        minStockThreshold: true,
        status: true,
      },
      orderBy: { stockQuantity: 'asc' },
      take: 10,
    });

    const productSummary = products.map((product) => ({
      ...product,
      isLowStock: product.stockQuantity <= product.minStockThreshold,
    }));

    res.json({
      success: true,
      data: productSummary,
    });
  } catch (error) {
    throw error;
  }
});

// Get activity log
router.get('/activity', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt((req.query.limit as string) || '10');

    const activityLogs = await prisma.activityLog.findMany({
      where: {
        userId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    res.json({
      success: true,
      data: activityLogs,
    });
  } catch (error) {
    throw error;
  }
});

// Get revenue data
router.get('/revenue', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt((req.query.days as string) || '7');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
        status: { not: OrderStatus.CANCELLED },
      },
      select: { createdAt: true, totalPrice: true },
    });

    const revenueMap: Record<string, number> = {};
    orders.forEach((order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      revenueMap[date] = (revenueMap[date] || 0) + order.totalPrice;
    });

    const revenueData = Object.entries(revenueMap)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: revenueData,
    });
  } catch (error) {
    throw error;
  }
});

// Get order data
router.get('/orders', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt((req.query.days as string) || '7');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await prisma.order.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: { createdAt: true },
    });

    const ordersMap: Record<string, number> = {};
    orders.forEach((order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      ordersMap[date] = (ordersMap[date] || 0) + 1;
    });

    const orderData = Object.entries(ordersMap)
      .map(([date, count]) => ({ date, orders: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    throw error;
  }
});

export default router;
