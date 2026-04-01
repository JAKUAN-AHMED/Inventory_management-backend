import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware.js';
import { OrderStatus, ProductStatus } from '@prisma/client';

const router = Router();

const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  customerName: z.string().min(2),
  items: z.array(orderItemSchema).min(1),
});

const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

// Get all orders with filters
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      search,
      status,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = {
      userId: req.user!.id,
    };

    if (search) {
      where.OR = [
        { orderNumber: { contains: search as string, mode: 'insensitive' } },
        { customerName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                },
              },
            },
          },
        },
        skip,
        take: pageSizeNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        data: orders,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
      },
    });
  } catch (error) {
    throw error;
  }
});

// Get single order
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
      return;
    }

    if (order.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    throw error;
  }
});

// Create order
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { customerName, items } = createOrderSchema.parse(req.body);

    // Validate products and check stock
    const productIds = items.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        userId: req.user!.id,
      },
    });

    // Check for duplicate products
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      res.status(400).json({
        success: false,
        message: 'Duplicate products in order. Each product can only be added once.',
      });
      return;
    }

    // Validate each product
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);

      if (!product) {
        res.status(400).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
        return;
      }

      if (product.status === ProductStatus.DISCONTINUED) {
        res.status(400).json({
          success: false,
          message: `This product is currently unavailable: ${product.name}`,
        });
        return;
      }

      if (product.stockQuantity < item.quantity) {
        res.status(400).json({
          success: false,
          message: `Only ${product.stockQuantity} items available in stock for ${product.name}`,
        });
        return;
      }
    }

    // Calculate total
    let totalPrice = 0;
    const orderItemsData = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const subtotal = product.price * item.quantity;
      totalPrice += subtotal;

      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
        subtotal,
      };
    });

    // Generate order number
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Create order with transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerName,
          userId: req.user!.id,
          status: OrderStatus.PENDING,
          totalPrice,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      // Update stock quantities
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)!;
        const newStockQuantity = product.stockQuantity - item.quantity;

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: newStockQuantity,
            status: newStockQuantity === 0 ? ProductStatus.OUT_OF_STOCK : product.status,
          },
        });

        // Add to restock queue if below threshold
        if (newStockQuantity <= product.minStockThreshold && newStockQuantity >= 0) {
          await tx.restockQueue.upsert({
            where: { productId: item.productId },
            update: {
              quantityNeeded: product.minStockThreshold - newStockQuantity + 10,
              priority: newStockQuantity === 0 ? 'HIGH' : newStockQuantity < product.minStockThreshold / 2 ? 'MEDIUM' : 'LOW',
            },
            create: {
              productId: item.productId,
              quantityNeeded: product.minStockThreshold - newStockQuantity + 10,
              priority: newStockQuantity === 0 ? 'HIGH' : 'MEDIUM',
            },
          });
        }
      }

      return createdOrder;
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: order.id,
        userId: req.user!.id,
        details: `Order ${order.orderNumber} created by user`,
      },
    });

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
      return;
    }
    throw error;
  }
});

// Update order status
router.patch('/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = updateOrderStatusSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
      return;
    }

    if (order.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    // Validate status transition
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!validTransitions[order.status].includes(status)) {
      res.status(400).json({
        success: false,
        message: `Cannot transition from ${order.status} to ${status}`,
      });
      return;
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ORDER_UPDATED',
        entityType: 'ORDER',
        entityId: id,
        userId: req.user!.id,
        details: `Order ${order.orderNumber} marked as ${status}`,
      },
    });

    res.json({
      success: true,
      data: updatedOrder,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
      return;
    }
    throw error;
  }
});

// Cancel order
router.patch('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
      return;
    }

    if (order.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    if (order.status === OrderStatus.DELIVERED) {
      res.status(400).json({
        success: false,
        message: 'Cannot cancel a delivered order',
      });
      return;
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // Restore stock quantities
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: {
              increment: item.quantity,
            },
          },
        });
      }
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'ORDER_CANCELLED',
        entityType: 'ORDER',
        entityId: id,
        userId: req.user!.id,
        details: `Order ${order.orderNumber} cancelled. ${reason || ''}`,
      },
    });

    res.json({
      success: true,
      data: updatedOrder,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
      return;
    }
    throw error;
  }
});

// Delete order
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found',
      });
      return;
    }

    if (order.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    await prisma.order.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

export default router;
