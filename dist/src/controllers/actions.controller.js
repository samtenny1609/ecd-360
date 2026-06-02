"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDomainActions = void 0;
exports.getCachedActions = getCachedActions;
const BASEROW_URL = "https://api.baserow.io";
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TABLE_DOMAIN_ACTIONS = 953220;
let cachedActions = null;
let isFetching = false;
async function getCachedActions() {
    if (cachedActions)
        return cachedActions;
    if (isFetching) {
        while (isFetching)
            await new Promise(r => setTimeout(r, 100));
        return cachedActions || [];
    }
    isFetching = true;
    try {
        const res = await fetch(`${BASEROW_URL}/api/database/rows/table/${TABLE_DOMAIN_ACTIONS}/?user_field_names=true&size=200`, { headers: { "Authorization": `Token ${BASEROW_TOKEN}` } });
        if (!res.ok)
            throw new Error(`Baserow DomainActions fetch failed: ${res.status}`);
        const data = await res.json();
        cachedActions = (data.results ?? []).map((r) => ({
            action_id: String(r.action_id ?? ""),
            domain: String(r.domain ?? ""),
            state: String(r.state ?? ""),
            explanation: String(r.explanation ?? ""),
            actions: String(r.actions ?? ""),
        }));
        console.log(`[Actions] Cached ${cachedActions.length} domain actions from Baserow`);
        return cachedActions;
    }
    catch (error) {
        console.error("[Actions] Failed to fetch DomainActions from Baserow:", error);
        return [];
    }
    finally {
        isFetching = false;
    }
}
const getDomainActions = async (_req, res) => {
    try {
        const actions = await getCachedActions();
        res.json(actions);
    }
    catch (error) {
        console.error("[Actions] getDomainActions error:", error);
        res.status(500).json({ error: "Failed to load domain actions" });
    }
};
exports.getDomainActions = getDomainActions;
