"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
// Get dashboard metrics
router.get('/metrics', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Get today's orders
        const todayOrders = await database_js_1.default.order.count({
            where: {
                userId,
                createdAt: {
                    gte: today,
                    lt: tomorrow,
                },
            },
        });
        // Get pending orders
        const pendingOrders = await database_js_1.default.order.count({
            where: {
                userId,
                status: client_1.OrderStatus.PENDING,
            },
        });
        // Get completed orders (delivered)
        const completedOrders = await database_js_1.default.order.count({
            where: {
                userId,
                status: client_1.OrderStatus.DELIVERED,
            },
        });
        // Get low stock items (stockQuantity <= minStockThreshold)
        const allProducts = await database_js_1.default.product.findMany({
            where: { userId },
            select: { stockQuantity: true, minStockThreshold: true },
        });
        const lowStockItems = allProducts.filter((p) => p.stockQuantity <= p.minStockThreshold).length;
        // Get today's revenue
        const todayRevenueData = await database_js_1.default.order.aggregate({
            where: {
                userId,
                createdAt: {
                    gte: today,
                    lt: tomorrow,
                },
                status: {
                    not: client_1.OrderStatus.CANCELLED,
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
        const yesterdayRevenueData = await database_js_1.default.order.aggregate({
            where: {
                userId,
                createdAt: {
                    gte: yesterday,
                    lt: today,
                },
                status: {
                    not: client_1.OrderStatus.CANCELLED,
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
    }
    catch (error) {
        throw error;
    }
});
// Get product summary
router.get('/product-summary', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const products = await database_js_1.default.product.findMany({
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
    }
    catch (error) {
        throw error;
    }
});
// Get activity log
router.get('/activity', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit || '10');
        const activityLogs = await database_js_1.default.activityLog.findMany({
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
    }
    catch (error) {
        throw error;
    }
});
// Get revenue data
router.get('/revenue', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days || '7');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const orders = await database_js_1.default.order.findMany({
            where: {
                userId,
                createdAt: { gte: startDate },
                status: { not: client_1.OrderStatus.CANCELLED },
            },
            select: { createdAt: true, totalPrice: true },
        });
        const revenueMap = {};
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
    }
    catch (error) {
        throw error;
    }
});
// Get order data
router.get('/orders', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days || '7');
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const orders = await database_js_1.default.order.findMany({
            where: {
                userId,
                createdAt: { gte: startDate },
            },
            select: { createdAt: true },
        });
        const ordersMap = {};
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
    }
    catch (error) {
        throw error;
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map