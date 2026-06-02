import { Router } from "express";
import { validateBody } from "../middlewares/validate";
import { requireAuth } from "../middlewares/requireAuth";
import { registerSchema, requestOtpSchema, verifyOtpSchema } from "../controllers/schemas";
import {
  register,
  requestOtp,
  verifyOtp,
  verifyFirebase,
  logout,
  deleteAccount,
} from "../controllers/auth.controller";

export const authRoutes = Router();

// POST /v1/auth/register
authRoutes.post("/register", validateBody(registerSchema), register);

// POST /v1/auth/login/request-otp
authRoutes.post("/login/request-otp", validateBody(requestOtpSchema), requestOtp);

// POST /v1/auth/login/verify-otp
authRoutes.post("/login/verify-otp", validateBody(verifyOtpSchema), verifyOtp);

// POST /v1/auth/login/verify-firebase  (Firebase phone auth)
authRoutes.post("/login/verify-firebase", verifyFirebase);

// POST /v1/auth/logout
authRoutes.post("/logout", logout);

// DELETE /v1/auth/account  (requires auth)
authRoutes.delete("/account", requireAuth, deleteAccount);
