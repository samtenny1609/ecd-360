"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChildSchema = exports.verifyOtpSchema = exports.requestOtpSchema = exports.registerSchema = exports.submitResponsesSchema = exports.cycleStartBodySchema = exports.childIdSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
// ─── Existing schemas (unmodified) ───
exports.childIdSchema = zod_1.z.object({
    child_id: zod_1.z.string().min(1, "Child ID is required"),
});
exports.cycleStartBodySchema = zod_1.z.object({
    child_id: zod_1.z.string().min(1, "Child ID is required"),
    cycle_type: zod_1.z.string().min(1, "Cycle Type is required"),
});
exports.submitResponsesSchema = zod_1.z.array(zod_1.z.object({
    prompt_id: zod_1.z.string().min(1, "Prompt ID is required"),
    domain: zod_1.z.nativeEnum(types_1.Domain),
    response_value: zod_1.z.nativeEnum(types_1.ResponseCode),
}));
// ─── Phase 2 schemas ───
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required"),
    email: zod_1.z.string().email("A valid email is required"),
    phone_number: zod_1.z.string().min(6, "Phone number is required"),
});
exports.requestOtpSchema = zod_1.z.object({
    phone_number: zod_1.z.string().min(6, "Phone number is required"),
});
exports.verifyOtpSchema = zod_1.z.object({
    phone_number: zod_1.z.string().min(6, "Phone number is required"),
    otp_code: zod_1.z.string().length(6, "OTP must be 6 digits"),
});
exports.createChildSchema = zod_1.z.object({
    pet_name: zod_1.z.string().min(1, "Child's name is required"),
    date_of_birth: zod_1.z.string().min(1, "Date of birth is required"),
});
