export enum Domain {
  COG = "COG",
  SE = "SE",
  LANG = "LANG",
  PHY = "PHY",
  ADP = "ADP",
}

export enum ResponseCode {
  OFTEN = "OFTEN",
  SOMETIMES = "SOMETIMES",
  NOT_YET = "NOT_YET",
  NEUTRAL = "NEUTRAL",
  REMIND_LATER = "REMIND_LATER",
}

export interface Caregiver {
  record_id: string;      // Airtable Record ID (internal)
  caregiver_id: string;   // UUID, app-generated, stored as text field
  name: string;
  email: string;
  phone_number: string;
  created_at: string;
  otp_code?: string | null;
  otp_expires_at?: string | null;
}

export interface Child {
  child_id: string;              // Airtable Record ID
  pet_name: string;
  date_of_birth: string;         // ISO DateTime
  gender?: string;
  created_at: string;
  // Phase 2 additions
  caregiver_id: string;          // UUID of owning Caregiver (text field, not linked record)
  last_cycle_completed_at?: string | null;
  next_cycle_available_at?: string | null;
  cycle_reminder_sent: boolean;
}

export interface ObservationCycle {
  cycle_id: string;              // Airtable Record ID
  child_id: string;              // Linked Record ID
  start_date: string;
  child_age_in_months: number;
  cycle_type: string;
  status: string;
  ended_early: boolean;          // Phase 2 addition
}

export interface ObservationPrompt {
  prompt_id: string;             // Custom string ID, e.g., P_LANG_10_12_001
  record_id: string;             // Airtable Record ID
  domain: Domain;
  timeline_min_months: number;
  timeline_max_months: number;
  prompt_text: string;
  is_active: boolean;
  version?: string;
}

export interface ResponseRecord {
  response_id: string;           // Airtable Record ID
  cycle_id: string;              // Linked Record
  prompt_id: string;             // String identifier of the prompt
  domain: Domain;
  response_value: ResponseCode;
}

// ─── Data Export Types ───

export interface CycleExportResult {
  cycle_id: string;
  start_date: string;
  child_age_in_months: number;
  ended_early: boolean;
  results: Array<{ domain: string; group_output: string }>;
}

export interface ChildExport {
  child: { pet_name: string; date_of_birth: string };
  cycles: CycleExportResult[];
}

// ─── Reminder Job Type ───

export interface ReminderChild {
  child_record_id: string;
  caregiver_id: string;
  pet_name: string;
}
