import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();

const createCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

const updateCategorySchema = createCategorySchema.partial();

// Get all categories
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        userId: req.user!.id,
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
  } catch (error) {
    throw error;
  }
});

// Get single category
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
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

    if (category.userId !== req.user!.id) {
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
  } catch (error) {
    throw error;
  }
});

// Create category
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description } = createCategorySchema.parse(req.body);

    // Check for duplicate
    const existing = await prisma.category.findFirst({
      where: {
        userId: req.user!.id,
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

    const category = await prisma.category.create({
      data: {
        name,
        description,
        userId: req.user!.id,
      },
    });

    res.status(201).json({
      success: true,
      data: category,
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

// Update category
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const data = updateCategorySchema.parse(req.body);

    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Category not found',
      });
      return;
    }

    if (existing.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    // Check for duplicate if name is being updated
    if (data.name) {
      const duplicate = await prisma.category.findFirst({
        where: {
          userId: req.user!.id,
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

    const category = await prisma.category.update({
      where: { id },
      data,
    });

    res.json({
      success: true,
      data: category,
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

// Delete category
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
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

    if (category.userId !== req.user!.id) {
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

    await prisma.category.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

export default router;
