"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = exports.AuditService = void 0;
const BASEROW_URL = "https://api.baserow.io";
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TABLE_AUDITS = 953219;
class AuditService {
    async logClassification(payload) {
        try {
            const body = {
                cycle_id: payload.cycle_id,
                domain: payload.domain,
                positive_count: payload.positive_count,
                negative_count: payload.negative_count,
                neutral_count: payload.neutral_count,
                excluded_count: payload.excluded_count,
                gate_fired: payload.gate_fired ?? "",
                group_output: payload.group_output,
                shadow_ml_input: JSON.stringify(payload.shadow_ml_input),
                computed_at: new Date().toISOString(),
            };
            if (payload.rule_matched !== null) {
                body.rule_matched = payload.rule_matched;
            }
            const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${TABLE_AUDITS}/?user_field_names=true`, {
                method: "POST",
                headers: {
                    "Authorization": `Token ${BASEROW_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.text();
                console.error("[AuditService] Baserow write failed:", res.status, err);
            }
        }
        catch (error) {
            console.error("[AuditService] Failed to write audit log to Baserow:", error);
        }
    }
}
exports.AuditService = AuditService;
exports.auditService = new AuditService();
