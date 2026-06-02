import { z } from "zod";
import { Domain, ResponseCode } from "../types";

// ─── Existing schemas (unmodified) ───

export const childIdSchema = z.object({
  child_id: z.string().min(1, "Child ID is required"),
});

export const cycleStartBodySchema = z.object({
  child_id: z.string().min(1, "Child ID is required"),
  cycle_type: z.string().min(1, "Cycle Type is required"),
});

export const submitResponsesSchema = z.array(
  z.object({
    prompt_id: z.string().min(1, "Prompt ID is required"),
    domain: z.nativeEnum(Domain),
    response_value: z.nativeEnum(ResponseCode),
  })
);

// ─── Phase 2 schemas ───

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone_number: z.string().min(6, "Phone number is required"),
});

export const requestOtpSchema = z.object({
  phone_number: z.string().min(6, "Phone number is required"),
});

export const verifyOtpSchema = z.object({
  phone_number: z.string().min(6, "Phone number is required"),
  otp_code: z.string().length(6, "OTP must be 6 digits"),
});

export const createChildSchema = z.object({
  pet_name: z.string().min(1, "Child's name is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
});

