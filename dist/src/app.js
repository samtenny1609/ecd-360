"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = require("express-rate-limit");
const cycle_routes_1 = require("./routes/cycle.routes");
const auth_routes_1 = require("./routes/auth.routes");
const children_routes_1 = require("./routes/children.routes");
const actions_routes_1 = require("./routes/actions.routes");
exports.app = (0, express_1.default)();
exports.app.set('trust proxy', 1);
// ─── Security and core middleware ─────────────────────────────────────────────
exports.app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Allow inline styles/scripts for frontend
}));
exports.app.use((0, cors_1.default)({
    origin: true,
    credentials: true, // Required for httpOnly cookie to be sent cross-origin
}));
exports.app.use(express_1.default.json());
exports.app.use((0, cookie_parser_1.default)()); // Parse httpOnly session cookies
// ─── Static frontend ─────────────────────────────────────────────────────────
exports.app.use(express_1.default.static(path_1.default.join(__dirname, "../..", "public")));
// ─── Global rate limiting ─────────────────────────────────────────────────────
const globalLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
});
exports.app.use(globalLimiter);
// ─── API routes ───────────────────────────────────────────────────────────────
exports.app.use("/v1/auth", auth_routes_1.authRoutes);
exports.app.use("/v1/children", children_routes_1.childrenRoutes);
exports.app.use("/v1/cycles", cycle_routes_1.cycleRoutes);
exports.app.use("/v1/actions", actions_routes_1.actionsRoutes);
// ─── Health check ─────────────────────────────────────────────────────────────
exports.app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
