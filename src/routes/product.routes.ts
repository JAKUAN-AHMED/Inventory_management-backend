import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware.js';
import { ProductStatus } from '@prisma/client';

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(2),
  categoryId: z.string().uuid(),
  price: z.number().positive(),
  stockQuantity: z.number().int().nonnegative().default(0),
  minStockThreshold: z.number().int().positive().default(5),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
});

const updateProductSchema = createProductSchema.partial();

// Get all products with filters
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      search,
      categoryId,
      status,
    } = req.query;

    const pageNum = parseInt(page as string);
    const pageSizeNum = parseInt(pageSize as string);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = {
      userId: req.user!.id,
    };

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (status) {
      where.status = status;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
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
      prisma.product.count({ where }),
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
  } catch (error) {
    throw error;
  }
});

// Get low stock products
router.get('/low-stock', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        userId: req.user!.id,
        OR: [
          { stockQuantity: 0 },
          { stockQuantity: { lte: prisma.product.fields.minStockThreshold } },
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
  } catch (error) {
    throw error;
  }
});

// Get single product
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
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

    if (product.userId !== req.user!.id) {
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
  } catch (error) {
    throw error;
  }
});

// Create product
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = createProductSchema.parse(req.body);

    // Verify category exists and belongs to user
    const category = await prisma.category.findFirst({
      where: {
        id: data.categoryId,
        userId: req.user!.id,
      },
    });

    if (!category) {
      res.status(400).json({
        success: false,
        message: 'Invalid category',
      });
      return;
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        userId: req.user!.id,
      },
      include: {
        category: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'PRODUCT_ADDED',
        entityType: 'PRODUCT',
        entityId: product.id,
        userId: req.user!.id,
        details: `Product "${product.name}" added`,
      },
    });

    res.status(201).json({
      success: true,
      data: product,
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

// Update product
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const data = updateProductSchema.parse(req.body);

    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    if (existingProduct.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    const product = await prisma.product.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'PRODUCT_UPDATED',
        entityType: 'PRODUCT',
        entityId: product.id,
        userId: req.user!.id,
        details: `Product "${product.name}" updated`,
      },
    });

    res.json({
      success: true,
      data: product,
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

// Delete product
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingProduct = await prisma.product.findUnique({
      where: { id },
    });

    if (!existingProduct) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    if (existingProduct.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    await prisma.product.delete({
      where: { id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: 'PRODUCT_DELETED',
        entityType: 'PRODUCT',
        entityId: id,
        userId: req.user!.id,
        details: `Product deleted`,
      },
    });

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    throw error;
  }
});

// Update stock
router.patch('/:id/stock', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { stockQuantity } = z.object({ stockQuantity: z.number().int().nonnegative() }).parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
      });
      return;
    }

    if (product.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    // Update product status based on stock
    let status = product.status;
    if (stockQuantity === 0) {
      status = ProductStatus.OUT_OF_STOCK;
    } else if (product.status === ProductStatus.OUT_OF_STOCK) {
      status = ProductStatus.ACTIVE;
    }

    const updatedProduct = await prisma.product.update({
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
    await prisma.activityLog.create({
      data: {
        action: 'STOCK_UPDATED',
        entityType: 'STOCK',
        entityId: id,
        userId: req.user!.id,
        details: `Stock updated for "${product.name}" to ${stockQuantity}`,
      },
    });

    // Add to restock queue if below threshold
    if (stockQuantity <= product.minStockThreshold && stockQuantity > 0) {
      await prisma.restockQueue.upsert({
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

export default router;
