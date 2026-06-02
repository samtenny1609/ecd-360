"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const validate_1 = require("../middlewares/validate");
const requireAuth_1 = require("../middlewares/requireAuth");
const schemas_1 = require("../controllers/schemas");
const auth_controller_1 = require("../controllers/auth.controller");
exports.authRoutes = (0, express_1.Router)();
// POST /v1/auth/register
exports.authRoutes.post("/register", (0, validate_1.validateBody)(schemas_1.registerSchema), auth_controller_1.register);
// POST /v1/auth/login/request-otp
exports.authRoutes.post("/login/request-otp", (0, validate_1.validateBody)(schemas_1.requestOtpSchema), auth_controller_1.requestOtp);
// POST /v1/auth/login/verify-otp
exports.authRoutes.post("/login/verify-otp", (0, validate_1.validateBody)(schemas_1.verifyOtpSchema), auth_controller_1.verifyOtp);
// POST /v1/auth/login/verify-firebase  (Firebase phone auth)
exports.authRoutes.post("/login/verify-firebase", auth_controller_1.verifyFirebase);
// POST /v1/auth/logout
exports.authRoutes.post("/logout", auth_controller_1.logout);
// DELETE /v1/auth/account  (requires auth)
exports.authRoutes.delete("/account", requireAuth_1.requireAuth, auth_controller_1.deleteAccount);
