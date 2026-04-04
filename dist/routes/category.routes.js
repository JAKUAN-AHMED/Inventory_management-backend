"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const router = (0, express_1.Router)();
const createCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
});
const updateCategorySchema = createCategorySchema.partial();
// Get all categories
router.get('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const categories = await database_js_1.default.category.findMany({
            where: {
                userId: req.user.id,
            },
            include: {
                _count: {
                    select: {
                        products: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            success: true,
            data: categories,
        });
    }
    catch (error) {
        throw error;
    }
});
// Get single category
router.get('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const category = await database_js_1.default.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: true,
                    },
                },
            },
        });
        if (!category) {
            res.status(404).json({
                success: false,
                message: 'Category not found',
            });
            return;
        }
        if (category.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        res.json({
            success: true,
            data: category,
        });
    }
    catch (error) {
        throw error;
    }
});
// Create category
router.post('/', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { name, description } = createCategorySchema.parse(req.body);
        // Check for duplicate
        const existing = await database_js_1.default.category.findFirst({
            where: {
                userId: req.user.id,
                name: { equals: name, mode: 'insensitive' },
            },
        });
        if (existing) {
            res.status(400).json({
                success: false,
                message: 'Category with this name already exists',
            });
            return;
        }
        const category = await database_js_1.default.category.create({
            data: {
                name,
                description,
                userId: req.user.id,
            },
        });
        res.status(201).json({
            success: true,
            data: category,
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
// Update category
router.put('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const data = updateCategorySchema.parse(req.body);
        const existing = await database_js_1.default.category.findUnique({
            where: { id },
        });
        if (!existing) {
            res.status(404).json({
                success: false,
                message: 'Category not found',
            });
            return;
        }
        if (existing.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        // Check for duplicate if name is being updated
        if (data.name) {
            const duplicate = await database_js_1.default.category.findFirst({
                where: {
                    userId: req.user.id,
                    name: { equals: data.name, mode: 'insensitive' },
                    id: { not: id },
                },
            });
            if (duplicate) {
                res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists',
                });
                return;
            }
        }
        const category = await database_js_1.default.category.update({
            where: { id },
            data,
        });
        res.json({
            success: true,
            data: category,
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
// Delete category
router.delete('/:id', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const category = await database_js_1.default.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: true,
                    },
                },
            },
        });
        if (!category) {
            res.status(404).json({
                success: false,
                message: 'Category not found',
            });
            return;
        }
        if (category.userId !== req.user.id) {
            res.status(403).json({
                success: false,
                message: 'Access denied',
            });
            return;
        }
        if (category._count.products > 0) {
            res.status(400).json({
                success: false,
                message: `Cannot delete category with ${category._count.products} products. Move or delete products first.`,
            });
            return;
        }
        await database_js_1.default.category.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: 'Category deleted successfully',
        });
    }
    catch (error) {
        throw error;
    }
});
exports.default = router;
//# sourceMappingURL=category.routes.js.map