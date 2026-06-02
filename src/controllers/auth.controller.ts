import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { dbService } from "../services/db.service";
import { registerSchema } from "./schemas";
import { env } from "../config/env";
import { t } from "../i18n";

// ─── JWT helpers ──────────────────────────────────────────────────────────────
const COOKIE_NAME = "parentzo_session";
const TOKEN_TTL   = 7 * 24 * 60 * 60; // 7 days in seconds

function signToken(caregiver_id: string): string {
  return jwt.sign({ caregiver_id }, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   TOKEN_TTL * 1000,
  });
}

// ─── Firebase token verification ──────────────────────────────────────────────
// Verifies a Firebase ID token using the Firebase REST API.
// No firebase-admin SDK needed — just the project's API key.
const FIREBASE_API_KEY = "AIzaSyBAmqHThT-7_pk7FwujtVed9YVppmepWIM";

async function verifyFirebaseToken(idToken: string): Promise<string | null> {
  try {
    const res  = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken }),
      }
    );
    const data = await res.json() as { users?: { phoneNumber?: string }[]; error?: { message: string } };

    if (!res.ok || !data.users || data.users.length === 0) {
      console.error("[Firebase] token verification failed:", data.error?.message);
      return null;
    }
    return data.users[0].phoneNumber ?? null; // e.g. "+919789974072"
  } catch (err) {
    console.error("[Firebase] token verification error:", err);
    return null;
  }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /v1/auth/register
 * Creates a new Caregiver account. No OTP — live immediately.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone_number } = registerSchema.parse(req.body);

    const existing = await dbService.findCaregiverByPhone(phone_number);
    if (existing) {
      res.status(409).json({ error: t("errors.phone_already_registered") });
      return;
    }

    const caregiver_id = crypto.randomUUID();
    const caregiver    = await dbService.createCaregiver({ caregiver_id, name, email, phone_number });

    res.status(201).json({
      message:      t("success.registered"),
      caregiver_id: caregiver.caregiver_id,
      name:         caregiver.name,
      email:        caregiver.email,
      phone_number: caregiver.phone_number,
    });
  } catch (err) {
    console.error("[Auth] register error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

/**
 * POST /v1/auth/login/request-otp
 * Kept for backward-compatibility. Firebase handles OTP sending on the frontend.
 * This endpoint is no longer called by the frontend but retained so existing
 * routes.ts does not need changes.
 */
export const requestOtp = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({ message: "OTP is handled by Firebase on the client." });
};

/**
 * POST /v1/auth/login/verify-otp
 * Legacy endpoint — kept so routes.ts does not need changes.
 * New Firebase flow uses /v1/auth/login/verify-firebase instead.
 */
export const verifyOtp = async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({ error: "This endpoint is deprecated. Use /v1/auth/login/verify-firebase." });
};

/**
 * POST /v1/auth/login/verify-firebase
 * Verifies the Firebase ID token produced by the frontend after the user
 * enters the correct OTP. On success, issues a 7-day httpOnly JWT cookie.
 *
 * Body: { phone_number: string, firebase_id_token: string }
 */
export const verifyFirebase = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone_number, firebase_id_token } = req.body as {
      phone_number:      string;
      firebase_id_token: string;
    };

    if (!phone_number || !firebase_id_token) {
      res.status(400).json({ error: t("errors.invalid_otp") });
      return;
    }

    // Verify the Firebase ID token and extract the phone number
    const firebasePhone = await verifyFirebaseToken(firebase_id_token);
    if (!firebasePhone) {
      res.status(401).json({ error: t("errors.invalid_otp") });
      return;
    }

    // Normalise both numbers to bare 10 digits for comparison
    const normalise = (p: string) => p.replace(/^\+91/, "").replace(/\D/g, "");
    if (normalise(firebasePhone) !== normalise(phone_number)) {
      console.warn("[Auth] Firebase phone mismatch:", firebasePhone, "vs", phone_number);
      res.status(401).json({ error: t("errors.invalid_otp") });
      return;
    }

    // Look up the Caregiver in Airtable
    const caregiver = await dbService.findCaregiverByPhone(normalise(phone_number));
    if (!caregiver) {
      res.status(404).json({ error: t("errors.caregiver_not_found") });
      return;
    }

    // Issue JWT session cookie
    const token = signToken(caregiver.caregiver_id);
    setSessionCookie(res, token);

    res.status(200).json({
      message:      t("success.logged_in"),
      caregiver_id: caregiver.caregiver_id,
      name:         caregiver.name,
      email:        caregiver.email,
    });
  } catch (err) {
    console.error("[Auth] verifyFirebase error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

/**
 * POST /v1/auth/logout
 */
export const logout = (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
  res.status(200).json({ message: t("success.logged_out") });
};

/**
 * DELETE /v1/auth/account
 */
export const deleteAccount = async (_req: Request, res: Response): Promise<void> => {
  try {
    const caregiver_id = res.locals.caregiver_id as string;
    await dbService.deleteCaregiverAndAllData(caregiver_id);
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
    res.status(200).json({ message: t("success.account_deleted") });
  } catch (err) {
    console.error("[Auth] deleteAccount error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

/**
 * POST /v1/auth/find-by-phone
 * Used by the first-time flow after contact collection.
 * Returns the caregiver if found (so we can link rather than duplicate).
 * Public endpoint — no auth required.
 */
export const findByPhone = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone_number } = req.body as { phone_number: string };
    if (!phone_number) { res.status(400).json({ error: "phone_number required" }); return; }

    const normalise = (p: string) => p.replace(/^\+91/, "").replace(/\D/g, "");
    const caregiver = await dbService.findCaregiverByPhone(normalise(phone_number));
    if (!caregiver) { res.status(404).json({ error: "Not found" }); return; }

    res.status(200).json({
      caregiver_id: caregiver.caregiver_id,
      name:         caregiver.name,
      email:        caregiver.email,
      phone_number: caregiver.phone_number,
    });
  } catch (err) {
    console.error("[Auth] findByPhone error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
