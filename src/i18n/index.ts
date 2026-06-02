export const en = {
  errors: {
    missing_api_key: "Server configuration error: missing API key.",
    validation_failed: "The provided data is invalid.",
    cycle_not_found: "The observation cycle could not be found.",
    internal_server_error: "An unexpected internal server error occurred.",
    invalid_enum_value: "An invalid choice was provided.",
    // Phase 2
    caregiver_not_found: "No account found with that phone number.",
    phone_already_registered: "An account with this phone number already exists.",
    invalid_otp: "The OTP entered is incorrect.",
    otp_expired: "The OTP has expired. Please request a new one.",
    unauthorized: "Authentication required. Please log in.",
    cycle_locked: "A new cycle cannot be started yet.",
    child_not_found: "The child record could not be found.",
    forbidden: "You do not have permission to access this resource.",
  },
  success: {
    cycle_started: "Observation cycle successfully started.",
    responses_submitted: "Responses successfully submitted.",
    // Phase 2
    registered: "Account created successfully.",
    otp_sent: "OTP sent.",
    logged_in: "Logged in successfully.",
    logged_out: "Logged out successfully.",
    account_deleted: "Your account and all associated data have been deleted.",
  },
};

// Simplified i18n dictionary mapping
type I18nKeys = typeof en;

export const t = (keyPath: string): string => {
  const keys = keyPath.split(".");
  let current: any = en;

  for (const key of keys) {
    if (current[key] === undefined) {
      console.warn(`[i18n] Missing translation for key: ${keyPath}`);
      return keyPath;
    }
    current = current[key];
  }

  return current as string;
};
