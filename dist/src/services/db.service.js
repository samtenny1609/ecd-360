"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbService = exports.DbService = void 0;
const actions_controller_1 = require("../controllers/actions.controller");
// ─── Baserow configuration ────────────────────────────────────────────────────
const BASEROW_URL = "https://api.baserow.io";
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TABLE_IDS = {
    Caregivers: 953163,
    Children: 953164,
    ObservationCycles: 953216,
    ObservationPrompts: 953217,
    Responses: 953218,
    ClassificationAudits: 953219,
    DomainActions: 953220,
};
// ─── Generic Baserow REST helpers ─────────────────────────────────────────────
const headers = () => ({
    "Authorization": `Token ${BASEROW_TOKEN}`,
    "Content-Type": "application/json",
});
async function brGet(tableId, params = {}) {
    const qs = new URLSearchParams({ size: "200", ...params }).toString();
    let url = `${BASEROW_URL}/api/database/rows/table/${tableId}/?${qs}&user_field_names=true`;
    const results = [];
    while (url) {
        const res = await fetch(url, { headers: headers() });
        const data = await res.json();
        results.push(...(data.results ?? []));
        url = data.next ?? null;
    }
    return results;
}
async function brGetById(tableId, rowId) {
    const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, { headers: headers() });
    if (!res.ok)
        throw new Error(`Baserow getById ${tableId}/${rowId} failed: ${res.status}`);
    return res.json();
}
async function brCreate(tableId, fields) {
    const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${tableId}/?user_field_names=true`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(fields),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Baserow create ${tableId} failed: ${res.status} ${err}`);
    }
    return res.json();
}
async function brUpdate(tableId, rowId, fields) {
    const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(fields),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Baserow update ${tableId}/${rowId} failed: ${res.status} ${err}`);
    }
}
async function brDelete(tableId, rowIds) {
    if (rowIds.length === 0)
        return;
    // Baserow batch delete: DELETE /api/database/rows/table/{id}/batch-delete/
    const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${tableId}/batch-delete/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ items: rowIds }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Baserow batch-delete ${tableId} failed: ${res.status} ${err}`);
    }
}
async function brFilter(tableId, field, value) {
    return brGet(tableId, {
        [`filter__${field}__equal`]: value,
    });
}
// ─── DbService ────────────────────────────────────────────────────────────────
class DbService {
    // ════════════════════════════════════════════════════════════════════════════
    //  Cycle Methods
    // ════════════════════════════════════════════════════════════════════════════
    async startCycle(childId, cycleType, ageInMonths, caregiverId, chosenDomain) {
        const row = await brCreate(TABLE_IDS.ObservationCycles, {
            child_id: childId,
            start_date: new Date().toISOString(),
            child_age_in_months: ageInMonths,
            cycle_type: cycleType,
            status: "in_progress",
            ended_early: false,
            caregiver_id: caregiverId || "",
            chosen_domain: chosenDomain ? [chosenDomain] : [],
        });
        return String(row.id);
    }
    async submitResponses(cycleId, responses, caregiverId, childId) {
        const existing = await this.fetchResponses(cycleId);
        const existingPromptIds = new Set(existing.map((r) => r.prompt_id));
        const toInsert = responses.filter(r => !existingPromptIds.has(r.prompt_id));
        if (toInsert.length === 0)
            return true;
        // Resolve caregiver_id + child_id from the cycle row if not provided
        let resolvedCaregiver = caregiverId || "";
        let resolvedChild = childId || "";
        if (!resolvedCaregiver || !resolvedChild) {
            try {
                const cycleRec = await brGetById(TABLE_IDS.ObservationCycles, Number(cycleId));
                if (!resolvedCaregiver)
                    resolvedCaregiver = cycleRec.caregiver_id || "";
                if (!resolvedChild)
                    resolvedChild = cycleRec.child_id || "";
            }
            catch (_) { }
        }
        for (const r of toInsert) {
            await brCreate(TABLE_IDS.Responses, {
                cycle_id: cycleId,
                prompt_id: r.prompt_id,
                domain: r.domain,
                response_value: r.response_value,
                caregiver_id: resolvedCaregiver,
                child_id: resolvedChild,
                answered_at: new Date().toISOString(),
            });
        }
        return true;
    }
    async fetchResponses(cycleId) {
        const rows = await brFilter(TABLE_IDS.Responses, "cycle_id", cycleId);
        return rows.map(r => ({
            response_id: String(r.id),
            cycle_id: cycleId,
            prompt_id: r.prompt_id,
            domain: r.domain,
            response_value: r.response_value,
        }));
    }
    async setCycleEndedEarly(cycleId) {
        await brUpdate(TABLE_IDS.ObservationCycles, Number(cycleId), { ended_early: true });
    }
    // ════════════════════════════════════════════════════════════════════════════
    //  Caregiver Auth Methods
    // ════════════════════════════════════════════════════════════════════════════
    async findCaregiverByPhone(phone_number) {
        const rows = await brFilter(TABLE_IDS.Caregivers, "phone_number", phone_number);
        if (rows.length === 0)
            return null;
        const r = rows[0];
        return {
            record_id: String(r.id),
            caregiver_id: r.caregiver_id,
            name: r.name,
            email: r.email,
            phone_number: r.phone_number,
            created_at: r.created_at ?? "",
            otp_code: r.otp_code ?? null,
            otp_expires_at: r.otp_expires_at ?? null,
        };
    }
    async createCaregiver(data) {
        const r = await brCreate(TABLE_IDS.Caregivers, {
            caregiver_id: data.caregiver_id,
            name: data.name,
            email: data.email,
            phone_number: data.phone_number,
        });
        return {
            record_id: String(r.id),
            caregiver_id: data.caregiver_id,
            name: data.name,
            email: data.email,
            phone_number: data.phone_number,
            created_at: new Date().toISOString(),
            otp_code: null,
            otp_expires_at: null,
        };
    }
    async updateCaregiverOtp(recordId, otp_code, otp_expires_at) {
        await brUpdate(TABLE_IDS.Caregivers, Number(recordId), { otp_code, otp_expires_at });
    }
    async clearCaregiverOtp(recordId) {
        await brUpdate(TABLE_IDS.Caregivers, Number(recordId), { otp_code: "", otp_expires_at: "" });
    }
    // ════════════════════════════════════════════════════════════════════════════
    //  Children Methods
    // ════════════════════════════════════════════════════════════════════════════
    async createChild(data) {
        const r = await brCreate(TABLE_IDS.Children, {
            pet_name: data.pet_name,
            date_of_birth: data.date_of_birth,
            caregiver_id: data.caregiver_id,
            cycle_reminder_sent: false,
        });
        return {
            child_id: String(r.id),
            pet_name: data.pet_name,
            date_of_birth: data.date_of_birth,
            caregiver_id: data.caregiver_id,
            created_at: new Date().toISOString(),
            cycle_reminder_sent: false,
        };
    }
    async getChildrenByCaregiver(caregiver_id) {
        const rows = await brFilter(TABLE_IDS.Children, "caregiver_id", caregiver_id);
        return rows.map(r => ({
            child_id: String(r.id),
            pet_name: r.pet_name,
            date_of_birth: r.date_of_birth,
            caregiver_id: r.caregiver_id,
            created_at: r.created_at ?? "",
            last_cycle_completed_at: r.last_cycle_completed_at ?? null,
            next_cycle_available_at: r.next_cycle_available_at ?? null,
            cycle_reminder_sent: Boolean(r.cycle_reminder_sent),
        }));
    }
    async getChildById(childId) {
        try {
            const r = await brGetById(TABLE_IDS.Children, Number(childId));
            return {
                child_id: String(r.id),
                pet_name: r.pet_name,
                date_of_birth: r.date_of_birth,
                caregiver_id: r.caregiver_id,
                created_at: r.created_at ?? "",
                last_cycle_completed_at: r.last_cycle_completed_at ?? null,
                next_cycle_available_at: r.next_cycle_available_at ?? null,
                cycle_reminder_sent: Boolean(r.cycle_reminder_sent),
            };
        }
        catch {
            return null;
        }
    }
    // ════════════════════════════════════════════════════════════════════════════
    //  Cycle Lock & Reminder Methods
    // ════════════════════════════════════════════════════════════════════════════
    async updateChildLockFields(childRecordId, last_cycle_completed_at, next_cycle_available_at) {
        await brUpdate(TABLE_IDS.Children, Number(childRecordId), {
            last_cycle_completed_at,
            next_cycle_available_at,
            cycle_reminder_sent: false,
        });
    }
    async resetChildCycleReminder(childRecordId) {
        await brUpdate(TABLE_IDS.Children, Number(childRecordId), { cycle_reminder_sent: false });
    }
    async getChildrenDueForReminder() {
        const rows = await brGet(TABLE_IDS.Children, {
            "filter__cycle_reminder_sent__equal": "false",
        });
        const now = new Date();
        return rows
            .filter(r => {
            const nextAt = r.next_cycle_available_at;
            return nextAt != null && nextAt !== "" && new Date(nextAt) <= now;
        })
            .map(r => ({
            child_record_id: String(r.id),
            caregiver_id: r.caregiver_id,
            pet_name: r.pet_name,
        }));
    }
    async setCycleReminderSent(childRecordId) {
        await brUpdate(TABLE_IDS.Children, Number(childRecordId), { cycle_reminder_sent: true });
    }
    // ════════════════════════════════════════════════════════════════════════════
    //  Delete / DPDP Act
    // ════════════════════════════════════════════════════════════════════════════
    async deleteResponsesForCycle(cycleId) {
        const responses = await brFilter(TABLE_IDS.Responses, "cycle_id", cycleId);
        await brDelete(TABLE_IDS.Responses, responses.map(r => r.id));
    }
    async deleteChildAndAllData(childId) {
        const cycles = await brFilter(TABLE_IDS.ObservationCycles, "child_id", childId);
        for (const cycle of cycles) {
            const cycleId = String(cycle.id);
            const responses = await brFilter(TABLE_IDS.Responses, "cycle_id", cycleId);
            const audits = await brFilter(TABLE_IDS.ClassificationAudits, "cycle_id", cycleId);
            await brDelete(TABLE_IDS.Responses, responses.map(r => r.id));
            await brDelete(TABLE_IDS.ClassificationAudits, audits.map(a => a.id));
        }
        await brDelete(TABLE_IDS.ObservationCycles, cycles.map(c => c.id));
        await brDelete(TABLE_IDS.Children, [Number(childId)]);
    }
    async deleteCaregiverAndAllData(caregiver_id) {
        const children = await brFilter(TABLE_IDS.Children, "caregiver_id", caregiver_id);
        for (const child of children) {
            await this.deleteChildAndAllData(String(child.id));
        }
        const caregivers = await brFilter(TABLE_IDS.Caregivers, "caregiver_id", caregiver_id);
        await brDelete(TABLE_IDS.Caregivers, caregivers.map(c => c.id));
    }
    // ════════════════════════════════════════════════════════════════════════════
    //  DomainActions lookup
    // ════════════════════════════════════════════════════════════════════════════
    async getActionForDomainAndState(domainCode, state) {
        const DOMAIN_DISPLAY_MAP = {
            COG: "Cognitive",
            SE: "Social & Emotional",
            LANG: "Language",
            PHY: "Physical Developement",
            ADP: "Adaptive",
        };
        const displayName = DOMAIN_DISPLAY_MAP[domainCode] ?? domainCode;
        try {
            const cachedActions = await (0, actions_controller_1.getCachedActions)();
            const actionData = cachedActions.find((a) => a.domain === displayName && a.state === state);
            if (!actionData) {
                console.warn(`[DomainActions] Cache miss for ${displayName} [${state}]`);
                return null;
            }
            return {
                explanation: actionData.explanation || null,
                actions: actionData.actions || null,
            };
        }
        catch (e) {
            console.error("[DomainActions] Cache read error:", e);
            return null;
        }
    }
}
exports.DbService = DbService;
exports.dbService = new DbService();
