import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.middleware.js';
import { RestockPriority, RestockStatus } from '@prisma/client';

const router = Router();

const createRestockSchema = z.object({
  productId: z.string().uuid(),
  quantityNeeded: z.number().int().positive(),
});

const updatePrioritySchema = z.object({
  priority: z.nativeEnum(RestockPriority),
});

// Get all restock queue items
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const restockQueue = await prisma.restockQueue.findMany({
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
  } catch (error) {
    throw error;
  }
});

// Add to restock queue
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { productId, quantityNeeded } = createRestockSchema.parse(req.body);

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        userId: req.user!.id,
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
    let priority: RestockPriority = 'LOW';
    if (product.stockQuantity === 0) {
      priority = 'HIGH';
    } else if (product.stockQuantity < product.minStockThreshold / 2) {
      priority = 'MEDIUM';
    }

    const restockItem = await prisma.restockQueue.upsert({
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
    await prisma.activityLog.create({
      data: {
        action: 'RESTOCK_QUEUED',
        entityType: 'RESTOCK',
        entityId: restockItem.id,
        userId: req.user!.id,
        details: `Product "${product.name}" added to Restock Queue`,
      },
    });

    res.json({
      success: true,
      data: restockItem,
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

// Update priority
router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { priority } = updatePrioritySchema.parse(req.body);

    const restockItem = await prisma.restockQueue.findUnique({
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

    if (restockItem.product.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    const updated = await prisma.restockQueue.update({
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

// Complete restock
router.patch('/:id/complete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const restockItem = await prisma.restockQueue.findUnique({
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

    if (restockItem.product.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    // Update product stock
    const newStockQuantity = restockItem.product.stockQuantity + restockItem.quantityNeeded;

    await prisma.$transaction(async (tx) => {
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
    await prisma.activityLog.create({
      data: {
        action: 'RESTOCK_COMPLETED',
        entityType: 'RESTOCK',
        entityId: id,
        userId: req.user!.id,
        details: `Restock completed for "${restockItem.product.name}"`,
      },
    });

    res.json({
      success: true,
      message: 'Restock completed successfully',
    });
  } catch (error) {
    throw error;
  }
});

// Bulk complete restock
router.post('/bulk-complete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);

    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        const restockItem = await tx.restockQueue.findUnique({
          where: { id },
          include: { product: true },
        });

        if (restockItem && restockItem.product.userId === req.user!.id) {
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

// Remove from queue
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const restockItem = await prisma.restockQueue.findUnique({
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

    if (restockItem.product.userId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    await prisma.restockQueue.update({
      where: { id },
      data: { status: 'REMOVED' },
    });

    res.json({
      success: true,
      message: 'Item removed from queue',
    });
  } catch (error) {
    throw error;
  }
});

export default router;
