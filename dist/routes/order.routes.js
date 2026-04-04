"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const orderItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantity: zod_1.z.number().int().positive(),
});
const createOrderSchema = zod_1.z.object({
    customerName: zod_1.z.string().min(2),
    customerId: zod_1.z.string().optional(),
    items: zod_1.z.array(orderItemSchema).min(1),
});
const updateOrderStatusSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(client_1.OrderStatus),
});
// Get all orders with filters
router.get('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { page = '1', pageSize = '10', search, status, dateFrom, dateTo, } = req.query;
        const pageNum = parseInt(page);
        const pageSizeNum = parseInt(pageSize);
        const skip = (pageNum - 1) * pageSizeNum;
        const where = {
            userId: req.user.id,
        };
        if (search) {
            where.OR = [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (status) {
            where.status = status;
        }
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom)
                where.createdAt.gte = new Date(dateFrom);
            if (dateTo)
                where.createdAt.lte = new Date(dateTo);
        }
        const [orders, total] = await Promise.all([
            database_js_1.default.order.findMany({
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
            database_js_1.default.order.count({ where }),
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
    }
    catch (error) {
        throw error;
    }
});
// Get single order
router.get('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await database_js_1.default.order.findUnique({
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
        if (order.userId !== req.user.id) {
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
    }
    catch (error) {
        throw error;
    }
});
// Create order
router.post('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { customerName, customerId, items } = createOrderSchema.parse(req.body);
        // Validate products and check stock
        const productIds = items.map((item) => item.productId);
        const products = await database_js_1.default.product.findMany({
            where: {
                id: { in: productIds },
                userId: req.user.id,
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
            if (product.status === client_1.ProductStatus.DISCONTINUED) {
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
            const product = products.find((p) => p.id === item.productId);
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
        const order = await database_js_1.default.$transaction(async (tx) => {
            // Create order
            const createdOrder = await tx.order.create({
                data: {
                    orderNumber,
                    customerId: customerId || `CUST-${Date.now()}`,
                    customerName,
                    userId: req.user.id,
                    status: client_1.OrderStatus.PENDING,
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
                const product = products.find((p) => p.id === item.productId);
                const newStockQuantity = product.stockQuantity - item.quantity;
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stockQuantity: newStockQuantity,
                        status: newStockQuantity === 0 ? client_1.ProductStatus.OUT_OF_STOCK : product.status,
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
        await database_js_1.default.activityLog.create({
            data: {
                action: 'ORDER_CREATED',
                entityType: 'ORDER',
                entityId: order.id,
                userId: req.user.id,
                details: `Order ${order.orderNumber} created by user`,
            },
        });
        res.status(201).json({
            success: true,
            data: order,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
router.patch('/:id/status', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = updateOrderStatusSchema.parse(req.body);
        const order = await database_js_1.default.order.findUnique({
            where: { id },
        });
        if (!order) {
            res.status(404).json({
                success: false,
                message: 'Order not found',
            });
            return;
        }
        if (order.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        // Validate status transition
        const validTransitions = {
            [client_1.OrderStatus.PENDING]: [client_1.OrderStatus.CONFIRMED, client_1.OrderStatus.CANCELLED],
            [client_1.OrderStatus.CONFIRMED]: [client_1.OrderStatus.SHIPPED, client_1.OrderStatus.CANCELLED],
            [client_1.OrderStatus.SHIPPED]: [client_1.OrderStatus.DELIVERED],
            [client_1.OrderStatus.DELIVERED]: [],
            [client_1.OrderStatus.CANCELLED]: [],
        };
        if (!validTransitions[order.status].includes(status)) {
            res.status(400).json({
                success: false,
                message: `Cannot transition from ${order.status} to ${status}`,
            });
            return;
        }
        const updatedOrder = await database_js_1.default.order.update({
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
        await database_js_1.default.activityLog.create({
            data: {
                action: 'ORDER_UPDATED',
                entityType: 'ORDER',
                entityId: id,
                userId: req.user.id,
                details: `Order ${order.orderNumber} marked as ${status}`,
            },
        });
        res.json({
            success: true,
            data: updatedOrder,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
router.patch('/:id/cancel', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = zod_1.z.object({ reason: zod_1.z.string().optional() }).parse(req.body);
        const order = await database_js_1.default.order.findUnique({
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
        if (order.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        if (order.status === client_1.OrderStatus.DELIVERED) {
            res.status(400).json({
                success: false,
                message: 'Cannot cancel a delivered order',
            });
            return;
        }
        // Update order status
        const updatedOrder = await database_js_1.default.order.update({
            where: { id },
            data: { status: client_1.OrderStatus.CANCELLED },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });
        // Restore stock quantities
        await database_js_1.default.$transaction(async (tx) => {
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
        await database_js_1.default.activityLog.create({
            data: {
                action: 'ORDER_CANCELLED',
                entityType: 'ORDER',
                entityId: id,
                userId: req.user.id,
                details: `Order ${order.orderNumber} cancelled. ${reason || ''}`,
            },
        });
        res.json({
            success: true,
            data: updatedOrder,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
router.delete('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await database_js_1.default.order.findUnique({
            where: { id },
        });
        if (!order) {
            res.status(404).json({
                success: false,
                message: 'Order not found',
            });
            return;
        }
        if (order.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        await database_js_1.default.order.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: 'Order deleted successfully',
        });
    }
    catch (error) {
        throw error;
    }
});
exports.default = router;
//# sourceMappingURL=order.routes.js.map