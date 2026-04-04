# Inventory Management System - Backend

A comprehensive RESTful API for inventory management built with Express, TypeScript, Prisma, and MongoDB.

## Features

- 🔐 **Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (ADMIN, MANAGER, USER)
  - Secure password hashing with bcrypt

- 📦 **Product Management**
  - Full CRUD operations
  - Stock tracking and low-stock alerts
  - Category-based organization
  - Product status management (ACTIVE, OUT_OF_STOCK, DISCONTINUED)

- 🛒 **Order Management**
  - Complete order lifecycle (PENDING → CONFIRMED → SHIPPED → DELIVERED)
  - Order cancellation with automatic stock restoration
  - Customer information tracking
  - Order history and filtering

- 📊 **Dashboard & Analytics**
  - Real-time metrics and KPIs
  - Revenue tracking
  - Order statistics
  - Activity logging

- 🔄 **Restock Queue**
  - Automatic low-stock detection
  - Priority-based restock management
  - Bulk restock operations

- 👥 **User Management** (Admin only)
  - User listing and management
  - Role assignment
  - Profile management
  - Password change

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB
- **ORM**: Prisma
- **Validation**: Zod
- **Authentication**: JWT (jsonwebtoken)
- **Security**: Helmet, CORS, express-rate-limit

## Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd Inventory_management-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   ```env
   DATABASE_URL="mongodb://localhost:27017/inventory_db"
   JWT_SECRET="your-super-secret-jwt-key"
   PORT=5000
   FRONTEND_URL="http://localhost:3000"
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate
   
   # Push schema to database
   npm run prisma:push
   
   # (Optional) Seed demo data
   npm run seed
   ```

5. **Start the server**
   ```bash
   # Development mode with hot reload
   npm run dev
   
   # Production mode
   npm run build
   npm run start
   ```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | User login |
| GET | `/api/auth/me` | Get current user (protected) |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (paginated, filterable) |
| GET | `/api/products/low-stock` | Get low stock products |
| GET | `/api/products/:id` | Get single product |
| POST | `/api/products` | Create product |
| PUT | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |
| PATCH | `/api/products/:id/stock` | Update stock quantity |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders (paginated, filterable) |
| GET | `/api/orders/:id` | Get single order |
| POST | `/api/orders` | Create order |
| PATCH | `/api/orders/:id/status` | Update order status |
| PATCH | `/api/orders/:id/cancel` | Cancel order |
| DELETE | `/api/orders/:id` | Delete order |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| GET | `/api/categories/:id` | Get single category |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |

### User Management (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/:id` | Get single user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| PUT | `/api/users/profile/me` | Update own profile |
| PUT | `/api/users/profile/change-password` | Change own password |

### Restock Queue
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/restock-queue` | List restock queue |
| POST | `/api/restock-queue` | Add to queue |
| PATCH | `/api/restock-queue/:id` | Update priority |
| PATCH | `/api/restock-queue/:id/complete` | Complete restock |
| DELETE | `/api/restock-queue/:id` | Remove from queue |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/metrics` | Dashboard KPIs |
| GET | `/api/dashboard/product-summary` | Product summary |
| GET | `/api/dashboard/activity` | Recent activity logs |
| GET | `/api/dashboard/revenue` | Revenue chart data |
| GET | `/api/dashboard/orders` | Order count data |

## Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript
npm run start        # Start production server
npm run prisma:generate  # Generate Prisma Client
npm run prisma:push      # Push schema to database
npm run prisma:studio    # Open Prisma Studio GUI
npm run seed         # Seed database with demo data
```

## Project Structure

```
src/
├── config/
│   └── database.ts          # Prisma client singleton
├── middleware/
│   ├── auth.middleware.ts   # JWT authentication
│   ├── admin.middleware.ts  # Admin role check
│   ├── error.middleware.ts  # Global error handler
│   └── notFound.middleware.ts # 404 handler
├── routes/
│   ├── auth.routes.ts       # Authentication endpoints
│   ├── user.routes.ts       # User management endpoints
│   ├── product.routes.ts    # Product CRUD
│   ├── order.routes.ts      # Order management
│   ├── category.routes.ts   # Category CRUD
│   ├── restock.routes.ts    # Restock queue
│   └── dashboard.routes.ts  # Dashboard metrics
└── server.ts                # Express app entry point
```

## Default Admin Account

After running `npm run seed`, you can login with:
- **Email**: admin@example.com
- **Password**: admin123

## Security Features

- ✅ Helmet.js for HTTP security headers
- ✅ CORS configuration
- ✅ Rate limiting (100 requests per 15 minutes)
- ✅ Input validation with Zod
- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Role-based access control

## License

MIT
