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
const createRestockSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantityNeeded: zod_1.z.number().int().positive(),
});
const updatePrioritySchema = zod_1.z.object({
    priority: zod_1.z.nativeEnum(client_1.RestockPriority),
});
// Get all restock queue items
router.get('/', auth_middleware_js_1.authMiddleware, async (_req, res) => {
    try {
        const restockQueue = await database_js_1.default.restockQueue.findMany({
            where: {
                status: 'PENDING',
            },
            include: {
                product: {
                    include: {
                        category: true,
                    },
                },
            },
            orderBy: [
                { priority: 'asc' },
                { product: { stockQuantity: 'asc' } },
            ],
        });
        res.json({
            success: true,
            data: restockQueue,
        });
    }
    catch (error) {
        throw error;
    }
});
// Add to restock queue
router.post('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { productId, quantityNeeded } = createRestockSchema.parse(req.body);
        const product = await database_js_1.default.product.findFirst({
            where: {
                id: productId,
                userId: req.user.id,
            },
        });
        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
            });
            return;
        }
        // Determine priority based on stock level
        let priority = 'LOW';
        if (product.stockQuantity === 0) {
            priority = 'HIGH';
        }
        else if (product.stockQuantity < product.minStockThreshold / 2) {
            priority = 'MEDIUM';
        }
        const restockItem = await database_js_1.default.restockQueue.upsert({
            where: { productId },
            update: {
                quantityNeeded,
                priority,
            },
            create: {
                productId,
                quantityNeeded,
                priority,
            },
            include: {
                product: {
                    include: {
                        category: true,
                    },
                },
            },
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'RESTOCK_QUEUED',
                entityType: 'RESTOCK',
                entityId: restockItem.id,
                userId: req.user.id,
                details: `Product "${product.name}" added to Restock Queue`,
            },
        });
        res.json({
            success: true,
            data: restockItem,
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
// Update priority
router.patch('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { priority } = updatePrioritySchema.parse(req.body);
        const restockItem = await database_js_1.default.restockQueue.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });
        if (!restockItem) {
            res.status(404).json({
                success: false,
                message: 'Restock item not found',
            });
            return;
        }
        if (restockItem.product.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        const updated = await database_js_1.default.restockQueue.update({
            where: { id },
            data: { priority },
            include: {
                product: {
                    include: {
                        category: true,
                    },
                },
            },
        });
        res.json({
            success: true,
            data: updated,
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
// Complete restock
router.patch('/:id/complete', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const restockItem = await database_js_1.default.restockQueue.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });
        if (!restockItem) {
            res.status(404).json({
                success: false,
                message: 'Restock item not found',
            });
            return;
        }
        if (restockItem.product.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        // Update product stock
        const newStockQuantity = restockItem.product.stockQuantity + restockItem.quantityNeeded;
        await database_js_1.default.$transaction(async (tx) => {
            // Update product stock
            await tx.product.update({
                where: { id: restockItem.productId },
                data: {
                    stockQuantity: newStockQuantity,
                    status: newStockQuantity > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
                },
            });
            // Update restock queue item
            await tx.restockQueue.update({
                where: { id },
                data: { status: 'COMPLETED' },
            });
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'RESTOCK_COMPLETED',
                entityType: 'RESTOCK',
                entityId: id,
                userId: req.user.id,
                details: `Restock completed for "${restockItem.product.name}"`,
            },
        });
        res.json({
            success: true,
            message: 'Restock completed successfully',
        });
    }
    catch (error) {
        throw error;
    }
});
// Bulk complete restock
router.post('/bulk-complete', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { ids } = zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string().uuid()) }).parse(req.body);
        await database_js_1.default.$transaction(async (tx) => {
            for (const id of ids) {
                const restockItem = await tx.restockQueue.findUnique({
                    where: { id },
                    include: { product: true },
                });
                if (restockItem && restockItem.product.userId === req.user.id) {
                    const newStockQuantity = restockItem.product.stockQuantity + restockItem.quantityNeeded;
                    await tx.product.update({
                        where: { id: restockItem.productId },
                        data: {
                            stockQuantity: newStockQuantity,
                            status: newStockQuantity > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
                        },
                    });
                    await tx.restockQueue.update({
                        where: { id },
                        data: { status: 'COMPLETED' },
                    });
                }
            }
        });
        res.json({
            success: true,
            message: `Successfully restocked ${ids.length} items`,
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
// Remove from queue
router.delete('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const restockItem = await database_js_1.default.restockQueue.findUnique({
            where: { id },
            include: {
                product: true,
            },
        });
        if (!restockItem) {
            res.status(404).json({
                success: false,
                message: 'Restock item not found',
            });
            return;
        }
        if (restockItem.product.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        await database_js_1.default.restockQueue.update({
            where: { id },
            data: { status: 'REMOVED' },
        });
        res.json({
            success: true,
            message: 'Item removed from queue',
        });
    }
    catch (error) {
        throw error;
    }
});
exports.default = router;
//# sourceMappingURL=restock.routes.js.map