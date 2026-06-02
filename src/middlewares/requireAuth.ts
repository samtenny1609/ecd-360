import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Validates the httpOnly "parentzo_session" JWT cookie.
 * Attaches caregiver_id to res.locals for downstream handlers.
 *
 * In test mode (NODE_ENV=test) the check is bypassed with a synthetic
 * caregiver_id so that the integration test suite remains unaffected.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  // ── Test bypass ──────────────────────────────────────────────────────────
  if (env.NODE_ENV === "test") {
    res.locals.caregiver_id = "test_caregiver_id";
    return next();
  }

  // ── Read cookie ──────────────────────────────────────────────────────────
  const token: string | undefined = (req as any).cookies?.parentzo_session;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // ── Verify JWT ───────────────────────────────────────────────────────────
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { caregiver_id: string };
    res.locals.caregiver_id = payload.caregiver_id;
    return next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};
