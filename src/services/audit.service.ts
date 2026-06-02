import { Domain } from "../types";

const BASEROW_URL   = "https://api.baserow.io";
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN!;
const TABLE_AUDITS  = 953219;

export interface AuditLogPayload {
  cycle_id:       string;
  domain:         Domain;
  positive_count: number;
  negative_count: number;
  neutral_count:  number;
  excluded_count: number;
  gate_fired:     string | null;
  rule_matched:   number | null;
  group_output:   string;
  shadow_ml_input: object;
}

export class AuditService {
  async logClassification(payload: AuditLogPayload): Promise<void> {
    try {
      const body: Record<string, any> = {
        cycle_id:        payload.cycle_id,
        domain:          payload.domain,
        positive_count:  payload.positive_count,
        negative_count:  payload.negative_count,
        neutral_count:   payload.neutral_count,
        excluded_count:  payload.excluded_count,
        gate_fired:      payload.gate_fired ?? "",
        group_output:    payload.group_output,
        shadow_ml_input: JSON.stringify(payload.shadow_ml_input),
        computed_at:     new Date().toISOString(),
      };
      if (payload.rule_matched !== null) {
        body.rule_matched = payload.rule_matched;
      }

      const res = await fetch(
        `${BASEROW_URL}/api/database/rows/table/${TABLE_AUDITS}/?user_field_names=true`,
        {
          method:  "POST",
          headers: {
            "Authorization": `Token ${BASEROW_TOKEN}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        console.error("[AuditService] Baserow write failed:", res.status, err);
      }
    } catch (error) {
      console.error("[AuditService] Failed to write audit log to Baserow:", error);
    }
  }
}

export const auditService = new AuditService();
