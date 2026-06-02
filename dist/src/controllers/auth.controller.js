"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findByPhone = exports.deleteAccount = exports.logout = exports.verifyFirebase = exports.verifyOtp = exports.requestOtp = exports.register = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_service_1 = require("../services/db.service");
const schemas_1 = require("./schemas");
const env_1 = require("../config/env");
const i18n_1 = require("../i18n");
// ─── JWT helpers ──────────────────────────────────────────────────────────────
const COOKIE_NAME = "parentzo_session";
const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
function signToken(caregiver_id) {
    return jsonwebtoken_1.default.sign({ caregiver_id }, env_1.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function setSessionCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env_1.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: TOKEN_TTL * 1000,
    });
}
// ─── Firebase token verification ──────────────────────────────────────────────
// Verifies a Firebase ID token using the Firebase REST API.
// No firebase-admin SDK needed — just the project's API key.
const FIREBASE_API_KEY = "AIzaSyBAmqHThT-7_pk7FwujtVed9YVppmepWIM";
async function verifyFirebaseToken(idToken) {
    try {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });
        const data = await res.json();
        if (!res.ok || !data.users || data.users.length === 0) {
            console.error("[Firebase] token verification failed:", data.error?.message);
            return null;
        }
        return data.users[0].phoneNumber ?? null; // e.g. "+919789974072"
    }
    catch (err) {
        console.error("[Firebase] token verification error:", err);
        return null;
    }
}
// ─── Controllers ─────────────────────────────────────────────────────────────
/**
 * POST /v1/auth/register
 * Creates a new Caregiver account. No OTP — live immediately.
 */
const register = async (req, res) => {
    try {
        const { name, email, phone_number } = schemas_1.registerSchema.parse(req.body);
        const existing = await db_service_1.dbService.findCaregiverByPhone(phone_number);
        if (existing) {
            res.status(409).json({ error: (0, i18n_1.t)("errors.phone_already_registered") });
            return;
        }
        const caregiver_id = crypto.randomUUID();
        const caregiver = await db_service_1.dbService.createCaregiver({ caregiver_id, name, email, phone_number });
        res.status(201).json({
            message: (0, i18n_1.t)("success.registered"),
            caregiver_id: caregiver.caregiver_id,
            name: caregiver.name,
            email: caregiver.email,
            phone_number: caregiver.phone_number,
        });
    }
    catch (err) {
        console.error("[Auth] register error:", err);
        res.status(500).json({ error: (0, i18n_1.t)("errors.internal_server_error") });
    }
};
exports.register = register;
/**
 * POST /v1/auth/login/request-otp
 * Kept for backward-compatibility. Firebase handles OTP sending on the frontend.
 * This endpoint is no longer called by the frontend but retained so existing
 * routes.ts does not need changes.
 */
const requestOtp = async (_req, res) => {
    res.status(200).json({ message: "OTP is handled by Firebase on the client." });
};
exports.requestOtp = requestOtp;
/**
 * POST /v1/auth/login/verify-otp
 * Legacy endpoint — kept so routes.ts does not need changes.
 * New Firebase flow uses /v1/auth/login/verify-firebase instead.
 */
const verifyOtp = async (_req, res) => {
    res.status(410).json({ error: "This endpoint is deprecated. Use /v1/auth/login/verify-firebase." });
};
exports.verifyOtp = verifyOtp;
/**
 * POST /v1/auth/login/verify-firebase
 * Verifies the Firebase ID token produced by the frontend after the user
 * enters the correct OTP. On success, issues a 7-day httpOnly JWT cookie.
 *
 * Body: { phone_number: string, firebase_id_token: string }
 */
const verifyFirebase = async (req, res) => {
    try {
        const { phone_number, firebase_id_token } = req.body;
        if (!phone_number || !firebase_id_token) {
            res.status(400).json({ error: (0, i18n_1.t)("errors.invalid_otp") });
            return;
        }
        // Verify the Firebase ID token and extract the phone number
        const firebasePhone = await verifyFirebaseToken(firebase_id_token);
        if (!firebasePhone) {
            res.status(401).json({ error: (0, i18n_1.t)("errors.invalid_otp") });
            return;
        }
        // Normalise both numbers to bare 10 digits for comparison
        const normalise = (p) => p.replace(/^\+91/, "").replace(/\D/g, "");
        if (normalise(firebasePhone) !== normalise(phone_number)) {
            console.warn("[Auth] Firebase phone mismatch:", firebasePhone, "vs", phone_number);
            res.status(401).json({ error: (0, i18n_1.t)("errors.invalid_otp") });
            return;
        }
        // Look up the Caregiver in Airtable
        const caregiver = await db_service_1.dbService.findCaregiverByPhone(normalise(phone_number));
        if (!caregiver) {
            res.status(404).json({ error: (0, i18n_1.t)("errors.caregiver_not_found") });
            return;
        }
        // Issue JWT session cookie
        const token = signToken(caregiver.caregiver_id);
        setSessionCookie(res, token);
        res.status(200).json({
            message: (0, i18n_1.t)("success.logged_in"),
            caregiver_id: caregiver.caregiver_id,
            name: caregiver.name,
            email: caregiver.email,
        });
    }
    catch (err) {
        console.error("[Auth] verifyFirebase error:", err);
        res.status(500).json({ error: (0, i18n_1.t)("errors.internal_server_error") });
    }
};
exports.verifyFirebase = verifyFirebase;
/**
 * POST /v1/auth/logout
 */
const logout = (_req, res) => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
    res.status(200).json({ message: (0, i18n_1.t)("success.logged_out") });
};
exports.logout = logout;
/**
 * DELETE /v1/auth/account
 */
const deleteAccount = async (_req, res) => {
    try {
        const caregiver_id = res.locals.caregiver_id;
        await db_service_1.dbService.deleteCaregiverAndAllData(caregiver_id);
        res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict" });
        res.status(200).json({ message: (0, i18n_1.t)("success.account_deleted") });
    }
    catch (err) {
        console.error("[Auth] deleteAccount error:", err);
        res.status(500).json({ error: (0, i18n_1.t)("errors.internal_server_error") });
    }
};
exports.deleteAccount = deleteAccount;
/**
 * POST /v1/auth/find-by-phone
 * Used by the first-time flow after contact collection.
 * Returns the caregiver if found (so we can link rather than duplicate).
 * Public endpoint — no auth required.
 */
const findByPhone = async (req, res) => {
    try {
        const { phone_number } = req.body;
        if (!phone_number) {
            res.status(400).json({ error: "phone_number required" });
            return;
        }
        const normalise = (p) => p.replace(/^\+91/, "").replace(/\D/g, "");
        const caregiver = await db_service_1.dbService.findCaregiverByPhone(normalise(phone_number));
        if (!caregiver) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.status(200).json({
            caregiver_id: caregiver.caregiver_id,
            name: caregiver.name,
            email: caregiver.email,
            phone_number: caregiver.phone_number,
        });
    }
    catch (err) {
        console.error("[Auth] findByPhone error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.findByPhone = findByPhone;
