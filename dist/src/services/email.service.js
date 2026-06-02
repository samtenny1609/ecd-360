"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCycleReminderEmail = sendCycleReminderEmail;
const env_1 = require("../config/env");
/**
 * Sends a cycle-reminder email to a caregiver.
 *
 * STUB: Until SMTP credentials are wired in, this function logs the
 * email details to the console. To activate real sending:
 *   1. Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM in .env
 *   2. Uncomment the nodemailer block below
 */
async function sendCycleReminderEmail(to, childName, nextCycleUrl) {
    if (env_1.env.SMTP_HOST && env_1.env.SMTP_USER && env_1.env.SMTP_PASS) {
        // ── Real implementation (activate when credentials are ready) ────────
        // const nodemailer = require("nodemailer");
        // const transporter = nodemailer.createTransport({
        //   host: env.SMTP_HOST,
        //   port: Number(env.SMTP_PORT),
        //   auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        // });
        // await transporter.sendMail({
        //   from: env.SMTP_FROM,
        //   to,
        //   subject: `Time for ${childName}'s next Parentzo observation`,
        //   text: `It's been 3 months! Click here to start: ${nextCycleUrl}`,
        //   html: `<p>It's been 3 months! <a href="${nextCycleUrl}">Start ${childName}'s observation</a>.</p>`,
        // });
        console.log(`[EMAIL] Would send real email to ${to} — SMTP block commented out`);
        return;
    }
    // ── Stub fallback ────────────────────────────────────────────────────────
    console.log(`[EMAIL STUB] ─────────────────────────────────`);
    console.log(`[EMAIL STUB] To:      ${to}`);
    console.log(`[EMAIL STUB] Subject: Time for ${childName}'s next Parentzo observation`);
    console.log(`[EMAIL STUB] Link:    ${nextCycleUrl}`);
    console.log(`[EMAIL STUB] ─────────────────────────────────`);
}
