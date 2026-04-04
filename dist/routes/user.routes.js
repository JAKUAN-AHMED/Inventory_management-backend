"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_middleware_js_1 = require("../middleware/auth.middleware.js");
const router = (0, express_1.Router)();
const updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    role: zod_1.z.enum(['ADMIN', 'MANAGER', 'USER']).optional(),
});
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(6),
    newPassword: zod_1.z.string().min(8),
});
// Get all users (Admin only)
router.get('/', auth_middleware_js_1.authMiddleware, auth_middleware_js_1.adminMiddleware, async (_req, res) => {
    try {
        const users = await database_js_1.default.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        products: true,
                        orders: true,
                        categories: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            success: true,
            data: users,
        });
    }
    catch (error) {
        throw error;
    }
});
// Get single user (Admin only)
router.get('/:id', auth_middleware_js_1.authMiddleware, auth_middleware_js_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await database_js_1.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                products: {
                    select: {
                        id: true,
                        name: true,
                        stockQuantity: true,
                        price: true,
                        createdAt: true,
                    },
                    take: 10,
                },
                orders: {
                    select: {
                        id: true,
                        orderNumber: true,
                        customerName: true,
                        totalPrice: true,
                        status: true,
                        createdAt: true,
                    },
                    take: 10,
                },
            },
        });
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        res.json({
            success: true,
            data: user,
        });
    }
    catch (error) {
        throw error;
    }
});
// Update user (Admin only)
router.put('/:id', auth_middleware_js_1.authMiddleware, auth_middleware_js_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, role } = updateUserSchema.parse(req.body);
        // Check if user exists
        const existingUser = await database_js_1.default.user.findUnique({
            where: { id },
        });
        if (!existingUser) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        // Check if email is already taken by another user
        if (email && email !== existingUser.email) {
            const emailExists = await database_js_1.default.user.findUnique({
                where: { email },
            });
            if (emailExists) {
                res.status(400).json({
                    success: false,
                    message: 'Email already in use',
                });
                return;
            }
        }
        // Update user
        const updatedUser = await database_js_1.default.user.update({
            where: { id },
            data: {
                email,
                role,
            },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json({
            success: true,
            data: updatedUser,
            message: 'User updated successfully',
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
// Delete user (Admin only)
router.delete('/:id', auth_middleware_js_1.authMiddleware, auth_middleware_js_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // Prevent self-deletion
        if (id === req.user?.id) {
            res.status(400).json({
                success: false,
                message: 'Cannot delete your own account',
            });
            return;
        }
        // Check if user exists
        const existingUser = await database_js_1.default.user.findUnique({
            where: { id },
        });
        if (!existingUser) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        // Check if user has associated data
        const productsCount = await database_js_1.default.product.count({
            where: { userId: id },
        });
        const ordersCount = await database_js_1.default.order.count({
            where: { userId: id },
        });
        if (productsCount > 0 || ordersCount > 0) {
            res.status(400).json({
                success: false,
                message: `Cannot delete user with existing data (${productsCount} products, ${ordersCount} orders)`,
            });
            return;
        }
        // Delete user
        await database_js_1.default.user.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: 'User deleted successfully',
        });
    }
    catch (error) {
        throw error;
    }
});
// Update own profile
router.put('/profile/me', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { email } = updateUserSchema.parse(req.body);
        const userId = req.user.id;
        // Check if email is already taken by another user
        if (email) {
            const existingEmail = await database_js_1.default.user.findUnique({
                where: { email },
            });
            if (existingEmail && existingEmail.id !== userId) {
                res.status(400).json({
                    success: false,
                    message: 'Email already in use',
                });
                return;
            }
        }
        // Update user
        const updatedUser = await database_js_1.default.user.update({
            where: { id: userId },
            data: { email },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json({
            success: true,
            data: updatedUser,
            message: 'Profile updated successfully',
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
// Change own password
router.put('/profile/change-password', auth_middleware_js_1.authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
        const userId = req.user.id;
        // Get user with password
        const user = await database_js_1.default.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        // Verify current password
        const isValidPassword = await bcrypt_1.default.compare(currentPassword, user.password);
        if (!isValidPassword) {
            res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
            return;
        }
        // Hash new password
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        // Update password
        await database_js_1.default.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        res.json({
            success: true,
            message: 'Password changed successfully',
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
//# sourceMappingURL=user.routes.js.map