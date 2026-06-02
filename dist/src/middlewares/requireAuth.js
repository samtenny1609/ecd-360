"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
/**
 * Validates the httpOnly "parentzo_session" JWT cookie.
 * Attaches caregiver_id to res.locals for downstream handlers.
 *
 * In test mode (NODE_ENV=test) the check is bypassed with a synthetic
 * caregiver_id so that the integration test suite remains unaffected.
 */
const requireAuth = (req, res, next) => {
    // ── Test bypass ──────────────────────────────────────────────────────────
    if (env_1.env.NODE_ENV === "test") {
        res.locals.caregiver_id = "test_caregiver_id";
        return next();
    }
    // ── Read cookie ──────────────────────────────────────────────────────────
    const token = req.cookies?.parentzo_session;
    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    // ── Verify JWT ───────────────────────────────────────────────────────────
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        res.locals.caregiver_id = payload.caregiver_id;
        return next();
    }
    catch {
        res.status(401).json({ error: "Unauthorized" });
    }
};
exports.requireAuth = requireAuth;
