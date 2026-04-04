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
const createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    categoryId: zod_1.z.string().uuid(),
    price: zod_1.z.number().positive(),
    stockQuantity: zod_1.z.number().int().nonnegative().default(0),
    minStockThreshold: zod_1.z.number().int().positive().default(5),
    status: zod_1.z.nativeEnum(client_1.ProductStatus).default(client_1.ProductStatus.ACTIVE),
});
const updateProductSchema = createProductSchema.partial();
// Get all products with filters
router.get('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { page = '1', pageSize = '10', search, categoryId, status, } = req.query;
        const pageNum = parseInt(page);
        const pageSizeNum = parseInt(pageSize);
        const skip = (pageNum - 1) * pageSizeNum;
        const where = {
            userId: req.user.id,
        };
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }
        if (categoryId) {
            where.categoryId = categoryId;
        }
        if (status) {
            where.status = status;
        }
        const [products, total] = await Promise.all([
            database_js_1.default.product.findMany({
                where,
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                skip,
                take: pageSizeNum,
                orderBy: { createdAt: 'desc' },
            }),
            database_js_1.default.product.count({ where }),
        ]);
        res.json({
            success: true,
            data: {
                data: products,
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
// Get low stock products
router.get('/low-stock', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const products = await database_js_1.default.product.findMany({
            where: {
                userId: req.user.id,
                OR: [
                    { stockQuantity: 0 },
                    { stockQuantity: { lte: database_js_1.default.product.fields.minStockThreshold } },
                ],
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: { stockQuantity: 'asc' },
        });
        res.json({
            success: true,
            data: {
                data: products,
                total: products.length,
                page: 1,
                pageSize: products.length,
                totalPages: 1,
            },
        });
    }
    catch (error) {
        throw error;
    }
});
// Get single product
router.get('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const product = await database_js_1.default.product.findUnique({
            where: { id },
            include: {
                category: true,
            },
        });
        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
            });
            return;
        }
        if (product.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        res.json({
            success: true,
            data: product,
        });
    }
    catch (error) {
        throw error;
    }
});
// Create product
router.post('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const data = createProductSchema.parse(req.body);
        // Verify category exists and belongs to user
        const category = await database_js_1.default.category.findFirst({
            where: {
                id: data.categoryId,
                userId: req.user.id,
            },
        });
        if (!category) {
            res.status(400).json({
                success: false,
                message: 'Invalid category',
            });
            return;
        }
        const product = await database_js_1.default.product.create({
            data: {
                ...data,
                userId: req.user.id,
            },
            include: {
                category: true,
            },
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'PRODUCT_ADDED',
                entityType: 'PRODUCT',
                entityId: product.id,
                userId: req.user.id,
                details: `Product "${product.name}" added`,
            },
        });
        res.status(201).json({
            success: true,
            data: product,
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
// Update product
router.put('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const data = updateProductSchema.parse(req.body);
        const existingProduct = await database_js_1.default.product.findUnique({
            where: { id },
        });
        if (!existingProduct) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
            });
            return;
        }
        if (existingProduct.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        const product = await database_js_1.default.product.update({
            where: { id },
            data,
            include: {
                category: true,
            },
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'PRODUCT_UPDATED',
                entityType: 'PRODUCT',
                entityId: product.id,
                userId: req.user.id,
                details: `Product "${product.name}" updated`,
            },
        });
        res.json({
            success: true,
            data: product,
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
// Delete product
router.delete('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const existingProduct = await database_js_1.default.product.findUnique({
            where: { id },
        });
        if (!existingProduct) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
            });
            return;
        }
        if (existingProduct.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        await database_js_1.default.product.delete({
            where: { id },
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'PRODUCT_DELETED',
                entityType: 'PRODUCT',
                entityId: id,
                userId: req.user.id,
                details: `Product deleted`,
            },
        });
        res.json({
            success: true,
            message: 'Product deleted successfully',
        });
    }
    catch (error) {
        throw error;
    }
});
// Update stock
router.patch('/:id/stock', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { stockQuantity } = zod_1.z.object({ stockQuantity: zod_1.z.number().int().nonnegative() }).parse(req.body);
        const product = await database_js_1.default.product.findUnique({
            where: { id },
        });
        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
            });
            return;
        }
        if (product.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        // Update product status based on stock
        let status = product.status;
        if (stockQuantity === 0) {
            status = client_1.ProductStatus.OUT_OF_STOCK;
        }
        else if (product.status === client_1.ProductStatus.OUT_OF_STOCK) {
            status = client_1.ProductStatus.ACTIVE;
        }
        const updatedProduct = await database_js_1.default.product.update({
            where: { id },
            data: {
                stockQuantity,
                status,
            },
            include: {
                category: true,
            },
        });
        // Log activity
        await database_js_1.default.activityLog.create({
            data: {
                action: 'STOCK_UPDATED',
                entityType: 'STOCK',
                entityId: id,
                userId: req.user.id,
                details: `Stock updated for "${product.name}" to ${stockQuantity}`,
            },
        });
        // Add to restock queue if below threshold
        if (stockQuantity <= product.minStockThreshold && stockQuantity > 0) {
            await database_js_1.default.restockQueue.upsert({
                where: { productId: id },
                update: {
                    quantityNeeded: product.minStockThreshold - stockQuantity + 10,
                    priority: stockQuantity === 0 ? 'HIGH' : stockQuantity < product.minStockThreshold / 2 ? 'MEDIUM' : 'LOW',
                },
                create: {
                    productId: id,
                    quantityNeeded: product.minStockThreshold - stockQuantity + 10,
                    priority: 'LOW',
                },
            });
        }
        res.json({
            success: true,
            data: updatedProduct,
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
exports.default = router;
//# sourceMappingURL=product.routes.js.map