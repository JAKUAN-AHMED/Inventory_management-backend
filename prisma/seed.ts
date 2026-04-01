import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create demo user
  const hashedPassword = await bcrypt.hash('demo123', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@inventory.com' },
    update: {},
    create: {
      email: 'demo@inventory.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ Created demo user:', demoUser.email);

  // Create categories
  let electronics = await prisma.category.findFirst({
    where: { userId: demoUser.id, name: 'Electronics' },
  });
  if (!electronics) {
    electronics = await prisma.category.create({
      data: {
        name: 'Electronics',
        description: 'Electronic devices and accessories',
        userId: demoUser.id,
      },
    });
  }

  let clothing = await prisma.category.findFirst({
    where: { userId: demoUser.id, name: 'Clothing' },
  });
  if (!clothing) {
    clothing = await prisma.category.create({
      data: {
        name: 'Clothing',
        description: 'Apparel, shoes, and accessories',
        userId: demoUser.id,
      },
    });
  }

  let grocery = await prisma.category.findFirst({
    where: { userId: demoUser.id, name: 'Grocery' },
  });
  if (!grocery) {
    grocery = await prisma.category.create({
      data: {
        name: 'Grocery',
        description: 'Food, beverages, and household items',
        userId: demoUser.id,
      },
    });
  }

  console.log('✅ Created categories');

  // Create products
  const products = [];
  
  const productData = [
    { name: 'iPhone 13 Pro', categoryId: electronics.id, price: 999.99, stockQuantity: 15, minStockThreshold: 5, status: 'ACTIVE' },
    { name: 'MacBook Pro 14"', categoryId: electronics.id, price: 1999.99, stockQuantity: 8, minStockThreshold: 3, status: 'ACTIVE' },
    { name: 'AirPods Pro', categoryId: electronics.id, price: 249.99, stockQuantity: 0, minStockThreshold: 10, status: 'OUT_OF_STOCK' },
    { name: 'T-Shirt Basic', categoryId: clothing.id, price: 29.99, stockQuantity: 150, minStockThreshold: 20, status: 'ACTIVE' },
    { name: 'Wireless Mouse', categoryId: electronics.id, price: 49.99, stockQuantity: 5, minStockThreshold: 10, status: 'ACTIVE' },
  ];

  for (const data of productData) {
    let product = await prisma.product.findFirst({
      where: { userId: demoUser.id, name: data.name },
    });
    if (!product) {
      product = await prisma.product.create({
        data: { 
          ...data, 
          userId: demoUser.id,
        },
      });
    }
    products.push(product);
  }

  console.log('✅ Created products');

  // Create sample orders
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-001023',
      customerId: 'cust1',
      customerName: 'John Doe',
      userId: demoUser.id,
      status: 'PENDING',
      totalPrice: 1249.98,
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
            price: 999.99,
            subtotal: 999.99,
          },
          {
            productId: products[2].id,
            quantity: 1,
            price: 249.99,
            subtotal: 249.99,
          },
        ],
      },
    },
  });

  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-001022',
      customerId: 'cust2',
      customerName: 'Jane Smith',
      userId: demoUser.id,
      status: 'SHIPPED',
      totalPrice: 2049.98,
      items: {
        create: [
          {
            productId: products[1].id,
            quantity: 1,
            price: 1999.99,
            subtotal: 1999.99,
          },
          {
            productId: products[3].id,
            quantity: 1,
            price: 29.99,
            subtotal: 29.99,
          },
          {
            productId: products[4].id,
            quantity: 1,
            price: 49.99,
            subtotal: 49.99,
          },
        ],
      },
    },
  });

  console.log('✅ Created sample orders');

  // Create activity logs
  await prisma.activityLog.createMany({
    data: [
      {
        action: 'USER_SIGNUP',
        entityType: 'USER',
        entityId: demoUser.id,
        userId: demoUser.id,
        details: 'User account created',
      },
      {
        action: 'PRODUCT_ADDED',
        entityType: 'PRODUCT',
        entityId: products[0].id,
        userId: demoUser.id,
        details: 'Product "iPhone 13 Pro" added',
      },
      {
        action: 'ORDER_CREATED',
        entityType: 'ORDER',
        entityId: order1.id,
        userId: demoUser.id,
        details: `Order ${order1.orderNumber} created`,
      },
    ],
  });

  console.log('✅ Created activity logs');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('📝 Demo Credentials:');
  console.log('   Email: demo@inventory.com');
  console.log('   Password: demo123');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
