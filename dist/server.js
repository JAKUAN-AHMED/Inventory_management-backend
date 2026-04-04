"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const product_routes_js_1 = __importDefault(require("./routes/product.routes.js"));
const order_routes_js_1 = __importDefault(require("./routes/order.routes.js"));
const category_routes_js_1 = __importDefault(require("./routes/category.routes.js"));
const restock_routes_js_1 = __importDefault(require("./routes/restock.routes.js"));
const dashboard_routes_js_1 = __importDefault(require("./routes/dashboard.routes.js"));
const user_routes_js_1 = __importDefault(require("./routes/user.routes.js"));
const error_middleware_js_1 = require("./middleware/error.middleware.js");
const notFound_middleware_js_1 = require("./middleware/notFound.middleware.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Security middleware
app.use((0, helmet_1.default)());
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);
// Body parsing middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// API Routes
app.use('/api/auth', auth_routes_js_1.default);
app.use('/api/products', product_routes_js_1.default);
app.use('/api/orders', order_routes_js_1.default);
app.use('/api/categories', category_routes_js_1.default);
app.use('/api/restock-queue', restock_routes_js_1.default);
app.use('/api/dashboard', dashboard_routes_js_1.default);
app.use('/api/users', user_routes_js_1.default);
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Inventory API is running' });
});
// Serve static files from frontend in production
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path_1.default.join(__dirname, '../../frontend/dist');
    app.use(express_1.default.static(frontendPath));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(frontendPath, 'index.html'));
    });
}
// Error handling
app.use(notFound_middleware_js_1.notFoundHandler);
app.use(error_middleware_js_1.errorHandler);
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
exports.default = app;
//# sourceMappingURL=server.js.map