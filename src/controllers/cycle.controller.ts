import { Request, Response } from "express";
import { dbService } from "../services/db.service";
import { groupingService } from "../services/grouping.service";
import { calculateAgeInMonths } from "../services/age.service";
import { cycleStartBodySchema, submitResponsesSchema } from "./schemas";
import { t } from "../i18n";
import { env } from "../config/env";

const BASEROW_URL = "https://api.baserow.io";

const TABLE_CYCLES = 953216;
const TABLE_PROMPTS = 986090;
const TABLE_CHILDREN = 953164;
const TABLE_RESPONSES = 953218;

const brHeaders = () => ({
  "Authorization": `Token ${process.env.BASEROW_API_TOKEN ?? ""}`,
  "Content-Type": "application/json",
});

async function brGetById(tableId: number, rowId: number): Promise<any> {
  const res = await fetch(
    `${BASEROW_URL}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
    { headers: brHeaders() }
  );
  if (!res.ok) throw new Error(`Baserow getById ${tableId}/${rowId} failed: ${res.status}`);
  return res.json();
}

async function brFilter(tableId: number, field: string, value: string): Promise<any[]> {
  const url = `${BASEROW_URL}/api/database/rows/table/${tableId}/?user_field_names=true&size=200&filter__${field}__equal=${encodeURIComponent(value)}`;
  const res = await fetch(url, { headers: brHeaders() });
  if (!res.ok) throw new Error(`Baserow filter ${tableId} failed: ${res.status}`);
  const data = await res.json() as { results: any[] };
  return data.results ?? [];
}

async function brGetPrompts(tableId: number, ageInMonths: number): Promise<any[]> {
  // Build pagination URLs manually — avoids 401 issues with Baserow-returned next URLs
  const results: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url =
      `${BASEROW_URL}/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}` +
      `&filter__timeline_min_months__lower_than_or_equal=${ageInMonths}` +
      `&filter__timeline_max_months__higher_than_or_equal=${ageInMonths}`;
    const res = await fetch(url, { headers: brHeaders() });
    if (!res.ok) throw new Error(`Baserow getPrompts failed: ${res.status}`);
    const data = await res.json() as { results: any[]; next: string | null };
    results.push(...(data.results ?? []));
    hasMore = data.next !== null;
    page++;
  }
  return results;
}


// ─── Baserow PATCH ────────────────────────────────────────────────────────────
async function brPatch(tableId: number, rowId: number, fields: Record<string, any>): Promise<void> {
  await fetch(
    `${BASEROW_URL}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
    { method: "PATCH", headers: brHeaders(), body: JSON.stringify(fields) }
  );
}

// ─── Get in-progress cycle for a child ───────────────────────────────────────
async function brGetActiveCycleForChild(childId: string): Promise<any | null> {
  const url = `${BASEROW_URL}/api/database/rows/table/${TABLE_CYCLES}/?user_field_names=true&size=10` +
    `&filter__status__equal=in_progress&filter__child_id__link_row_has=${childId}`;
  const res = await fetch(url, { headers: brHeaders() });
  if (!res.ok) return null;
  const data = await res.json() as { results: any[] };
  const cycles = data.results ?? [];
  return cycles.length > 0 ? cycles[cycles.length - 1] : null;
}

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export const startCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    console.log("[startCycle] Step 1: parsing body");
    const { child_id, cycle_type } = cycleStartBodySchema.parse(req.body);
    const caregiver_id = res.locals.caregiver_id as string;
    console.log("[startCycle] Step 2: finding child", child_id);

    const childRec = await brGetById(TABLE_CHILDREN, Number(child_id));
    if (!childRec) return res.status(404).json({ error: t("errors.child_not_found") });
    console.log("[startCycle] Step 3: ownership check");

    if ((childRec.caregiver_id as string) !== caregiver_id) {
      return res.status(403).json({ error: t("errors.forbidden") });
    }

    // CYCLE LOCK DISABLED — re-enable by uncommenting the block below
    // const nextAvailable = childRec.next_cycle_available_at as string | undefined;
    // if (nextAvailable && nextAvailable !== "" && new Date(nextAvailable) > new Date()) {
    //   return res.status(403).json({ error: "CYCLE_LOCKED", next_available_at: nextAvailable });
    // }

    const dob = childRec.date_of_birth as string;
    console.log("[startCycle] Step 4: dob =", dob);
    const ageInMonths = calculateAgeInMonths(dob, new Date());
    console.log("[startCycle] Step 5: ageInMonths =", ageInMonths);

    const cycleId = await dbService.startCycle(child_id, cycle_type, ageInMonths, caregiver_id, req.body.chosen_domain);
    console.log("[startCycle] Step 6: cycleId =", cycleId);

    await dbService.resetChildCycleReminder(child_id);
    console.log("[startCycle] Step 7: reminder reset");

    const allPrompts = await brGetPrompts(TABLE_PROMPTS, ageInMonths);
    console.log("[startCycle] Step 8: prompts fetched =", allPrompts.length);

    const byDomain: Record<string, any[]> = {};
    for (const p of allPrompts) {
      const domain = p.domain as string;
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(p);
    }

    const sampledPrompts: any[] = [];
    for (const domain of ["COG", "LANG", "PHY", "SE", "ADP"]) {
      const pool = shuffle([...(byDomain[domain] ?? [])]);
      sampledPrompts.push(...pool.slice(0, 8));
    }

    const promptsForClient = sampledPrompts.map((p: any) => ({
      prompt_id: p.prompt_id,
      domain: p.domain,
      text: p.prompt_text,
    }));

    // Save selected prompts so the user can resume if they abandon mid-quiz
    try {
      await brPatch(TABLE_CYCLES, Number(cycleId), {
        selected_prompts: JSON.stringify(promptsForClient)
      });
    } catch (e) {
      console.warn("[startCycle] Failed to save selected_prompts:", e);
    }

    return res.status(201).json({
      message: t("success.cycle_started"),
      cycle_id: cycleId,
      prompts: promptsForClient,
    });
  } catch (err) {
    console.error("[Cycle] startCycle error:", err);
    return res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const submitResponses = async (req: Request, res: Response): Promise<Response> => {
  try {
    const cycle_id = req.params.cycle_id;
    const responses = submitResponsesSchema.parse(req.body);
    // Pass caregiver_id from auth session if available (undefined for guest)
    const caregiver_id = res.locals.caregiver_id as string | undefined;
    await dbService.submitResponses(cycle_id, responses, caregiver_id);
    return res.status(200).json({ message: t("success.responses_submitted") });
  } catch (err) {
    console.error("[Cycle] submitResponses error:", err);
    return res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const fetchSummary = async (req: Request, res: Response): Promise<Response> => {
  try {
    const cycle_id = req.params.cycle_id;

    const cycleObj = await brGetById(TABLE_CYCLES, Number(cycle_id));
    if (!cycleObj) return res.status(404).json({ error: t("errors.cycle_not_found") });

    const ageInMonths = Number(cycleObj.child_age_in_months);
    const rawResponses = await dbService.fetchResponses(cycle_id);
    const classifications = await groupingService.classifyCycleResponses(
      cycle_id, ageInMonths, rawResponses
    );

    // CYCLE LOCK DISABLED — re-enable by uncommenting the block below
    // const childId = cycleObj.child_id as string | undefined;
    // if (childId) {
    //   const now = new Date();
    //   const threeMonthsLater = new Date(now);
    //   threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    //   await dbService.updateChildLockFields(childId, now.toISOString(), threeMonthsLater.toISOString());
    // }

    const classificationsWithActions = await Promise.all(
      classifications.map(async (cls) => {
        if (cls.group === "INCOMPLETE") return { ...cls, explanation: null, actions: null };
        const actionData = await dbService.getActionForDomainAndState(cls.domain, cls.group);
        return {
          ...cls,
          explanation: actionData?.explanation ?? null,
          actions: actionData?.actions ?? null,
        };
      })
    );

    console.log("[Summary Response]", JSON.stringify(classificationsWithActions, null, 2));
    return res.status(200).json(classificationsWithActions);
  } catch (err) {
    console.error("[Cycle] fetchSummary error:", err);
    return res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const endEarly = async (req: Request, res: Response): Promise<Response> => {
  if (env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const cycle_id = req.params.cycle_id;
    const caregiver_id = res.locals.caregiver_id as string;

    const cycleObj = await brGetById(TABLE_CYCLES, Number(cycle_id));
    if (!cycleObj) return res.status(404).json({ error: t("errors.cycle_not_found") });

    const childId = cycleObj.child_id as string | undefined;
    if (childId) {
      const child = await dbService.getChildById(childId);
      if (!child || child.caregiver_id !== caregiver_id) {
        return res.status(403).json({ error: t("errors.forbidden") });
      }
    }

    const ageInMonths = Number(cycleObj.child_age_in_months);
    const rawResponses = await dbService.fetchResponses(cycle_id);
    const classifications = await groupingService.classifyCycleResponses(
      cycle_id, ageInMonths, rawResponses
    );

    // CYCLE LOCK DISABLED — re-enable by uncommenting the block below
    // if (childId) {
    //   const now = new Date();
    //   const threeMonthsLater = new Date(now);
    //   threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    //   await dbService.updateChildLockFields(childId, now.toISOString(), threeMonthsLater.toISOString());
    // }
    await dbService.setCycleEndedEarly(cycle_id);

    const classificationsWithActions = await Promise.all(
      classifications.map(async (cls) => {
        if (cls.group === "INCOMPLETE") return { ...cls, explanation: null, actions: null };
        const actionData = await dbService.getActionForDomainAndState(cls.domain, cls.group);
        return {
          ...cls,
          explanation: actionData?.explanation ?? null,
          actions: actionData?.actions ?? null,
        };
      })
    );

    return res.status(200).json(classificationsWithActions);
  } catch (err) {
    console.error("[Cycle] endEarly error:", err);
    return res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

// ─── Get active (in-progress) cycle for a child ──────────────────────────────
export const getActiveCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const child_id = req.params.child_id;
    const caregiver_id = res.locals.caregiver_id as string;

    // Verify child ownership
    const childRec = await brGetById(TABLE_CHILDREN, Number(child_id));
    if (!childRec || (childRec.caregiver_id as string) !== caregiver_id) {
      return res.status(200).json({ cycle_id: null });
    }

    const cycle = await brGetActiveCycleForChild(child_id);
    if (!cycle) return res.status(200).json({ cycle_id: null });

    // Parse saved prompts
    let savedPrompts: any[] = [];
    try { savedPrompts = JSON.parse(cycle.selected_prompts || "[]"); } catch { savedPrompts = []; }

    if (savedPrompts.length === 0) return res.status(200).json({ cycle_id: null });

    // Fetch responses already submitted for this cycle
    const existingResponses = await dbService.fetchResponses(String(cycle.id));

    return res.status(200).json({
      cycle_id: cycle.id,
      prompts: savedPrompts,
      responses: existingResponses,
      answered_count: existingResponses.length,
      total_count: savedPrompts.length,
    });
  } catch (err) {
    console.error("[Cycle] getActiveCycle error:", err);
    return res.status(200).json({ cycle_id: null }); // never break the UI
  }
};

// ─── Abandon an in-progress cycle (clean break — Start Fresh) ────────────────
export const abandonCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const cycle_id = req.params.cycle_id;
    const caregiver_id = res.locals.caregiver_id as string;

    const cycleObj = await brGetById(TABLE_CYCLES, Number(cycle_id));
    if (!cycleObj) return res.status(404).json({ error: t("errors.cycle_not_found") });

    // Verify ownership via child
    const childId = cycleObj.child_id as string | undefined;
    if (childId) {
      const child = await brGetById(TABLE_CHILDREN, Number(childId));
      if (!child || child.caregiver_id !== caregiver_id) {
        return res.status(403).json({ error: t("errors.forbidden") });
      }
    }

    // Mark cycle as abandoned
    await brPatch(TABLE_CYCLES, Number(cycle_id), { status: "abandoned" });

    // Delete responses for this cycle inline (clean break)
    try {
      // Fetch all response row IDs for this cycle
      let page = 1; let hasMore = true; const rowIds: number[] = [];
      while (hasMore) {
        const rUrl = `${BASEROW_URL}/api/database/rows/table/${TABLE_RESPONSES}/?user_field_names=true&size=200&page=${page}&filter__cycle_id__link_row_has=${cycle_id}`;
        const rRes = await fetch(rUrl, { headers: brHeaders() });
        if (!rRes.ok) break;
        const rData = await rRes.json() as { results: any[]; next: string | null };
        rData.results.forEach((r: any) => rowIds.push(r.id));
        hasMore = rData.next !== null; page++;
      }
      // Delete in batches of 200
      for (let i = 0; i < rowIds.length; i += 200) {
        const batch = rowIds.slice(i, i + 200);
        await fetch(`${BASEROW_URL}/api/database/rows/table/${TABLE_RESPONSES}/batch-delete/`, {
          method: "POST", headers: brHeaders(),
          body: JSON.stringify({ items: batch })
        });
      }
    } catch (e) {
      console.warn("[abandonCycle] Could not delete responses:", e);
    }

    return res.status(200).json({ message: "Cycle abandoned" });
  } catch (err) {
    console.error("[Cycle] abandonCycle error:", err);
    return res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

// ─── Guest Cycle Start (no auth required — first-time flow) ──────────────────
// POST /v1/cycles/start-guest
// Creates a temporary child + cycle before the caregiver registers.
// Returns { cycle_id, child_id, prompts (for chosen domain) }
export const startGuestCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { pet_name, date_of_birth, caregiver_name, chosen_domain } = req.body as {
      pet_name: string;
      date_of_birth: string;
      caregiver_name?: string;
      chosen_domain?: string;
    };

    if (!pet_name || !date_of_birth) {
      return res.status(400).json({ error: "pet_name and date_of_birth are required" });
    }

    const ageInMonths = calculateAgeInMonths(date_of_birth, new Date());

    // Age gate — reject if child is under 3 months or over 72 months
    if (ageInMonths < 3) {
      return res.status(400).json({ error: "ECD360 supports children aged 3 months and above." });
    }
    if (ageInMonths > 72) {
      return res.status(400).json({ error: "ECD360 covers development up to 72 months." });
    }

    // Create a guest child row (no caregiver_id yet — will be linked after contact collection)
    const childRow = await brCreate(TABLE_CHILDREN, {
      pet_name,
      date_of_birth,
      caregiver_id: "",          // will be filled in by link-child endpoint
      caregiver_name_guest: caregiver_name || "",
      cycle_reminder_sent: false,
    });
    const childId = String(childRow.id);

    // Create the cycle row
    const cycleRow = await brCreate(TABLE_CYCLES, {
      child_id:            childId,
      start_date:          new Date().toISOString(),
      child_age_in_months: ageInMonths,
      cycle_type:          "regular",
      status:              "in_progress",
      ended_early:         false,
      chosen_domain:       chosen_domain ? [chosen_domain] : [],
    });
    const cycleId = String(cycleRow.id);

    // Fetch prompts for chosen domain (or all if not specified)
    let allPrompts: any[] = [];
    try {
      allPrompts = await brGetPrompts(TABLE_PROMPTS, ageInMonths);
    } catch (_) {}

    const domainFilter = chosen_domain || null;
    const byDomain: Record<string, any[]> = {};
    for (const p of allPrompts) {
      const d = p.domain as string;
      if (domainFilter && d !== domainFilter) continue;
      if (!byDomain[d]) byDomain[d] = [];
      byDomain[d].push(p);
    }

    const sampledPrompts: any[] = [];
    const domainsToSample = domainFilter ? [domainFilter] : ["COG","LANG","PHY","SE","ADP"];
    for (const domain of domainsToSample) {
      const pool = shuffle([...(byDomain[domain] ?? [])]);
      sampledPrompts.push(...pool.slice(0, 8));
    }

    const promptsForClient = sampledPrompts.map((p: any) => ({
      prompt_id: p.prompt_id,
      domain:    p.domain,
      text:      p.prompt_text,
    }));

    // Save selected prompts to cycle
    try {
      await brPatch(TABLE_CYCLES, Number(cycleId), { selected_prompts: JSON.stringify(promptsForClient) });
    } catch (_) {}

    return res.status(201).json({ cycle_id: cycleId, child_id: childId, prompts: promptsForClient });
  } catch (err) {
    console.error("[Cycle] startGuestCycle error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Helper used above — defined here so it compiles standalone
async function brCreate(tableId: number, fields: Record<string, any>): Promise<any> {
  const res = await fetch(
    `${BASEROW_URL}/api/database/rows/table/${tableId}/?user_field_names=true`,
    { method: "POST", headers: brHeaders(), body: JSON.stringify(fields) }
  );
  if (!res.ok) { const e = await res.text(); throw new Error(`brCreate ${tableId} failed: ${res.status} ${e}`); }
  return res.json();
}

// ─── Start a new domain within an existing cycle ─────────────────────────────
// POST /v1/cycles/start-domain
// Fetches prompts for a new domain and appends the domain to chosen_domain.
export const startDomainInCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { cycle_id, child_id, domain } = req.body as {
      cycle_id: string; child_id: string; domain: string;
    };

    if (!cycle_id || !domain) {
      return res.status(400).json({ error: "cycle_id and domain are required" });
    }

    const childRec = await brGetById(TABLE_CHILDREN, Number(child_id));
    const ageInMonths = calculateAgeInMonths(childRec.date_of_birth as string, new Date());

    const allPrompts = await brGetPrompts(TABLE_PROMPTS, ageInMonths);
    const pool = shuffle(allPrompts.filter((p: any) => p.domain === domain));
    const sampled = pool.slice(0, 8);

    const promptsForClient = sampled.map((p: any) => ({
      prompt_id: p.prompt_id,
      domain:    p.domain,
      text:      p.prompt_text,
    }));

    // Append domain to chosen_domain multiselect on the cycle
    try {
      const cycleRec = await brGetById(TABLE_CYCLES, Number(cycle_id));
      const existing: string[] = (cycleRec.chosen_domain || []).map((v: any) => typeof v === "object" ? v.value : v);
      if (!existing.includes(domain)) {
        await brPatch(TABLE_CYCLES, Number(cycle_id), { chosen_domain: [...existing, domain] });
      }
    } catch (_) {}

    return res.status(200).json({ prompts: promptsForClient });
  } catch (err) {
    console.error("[Cycle] startDomainInCycle error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Link caregiver to a cycle (after contact collection) ────────────────────
// POST /v1/cycles/:cycle_id/link-caregiver
export const linkCaregiverToCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { cycle_id } = req.params;
    const { caregiver_id } = req.body as { caregiver_id: string };
    if (!caregiver_id) return res.status(400).json({ error: "caregiver_id required" });
    await brPatch(TABLE_CYCLES, Number(cycle_id), { caregiver_id });
    return res.status(200).json({ message: "Caregiver linked to cycle" });
  } catch (err) {
    console.error("[Cycle] linkCaregiverToCycle error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Link child to an existing cycle (after guest child is created) ───────────
// POST /v1/cycles/:cycle_id/link-child
export const linkChildToCycle = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { cycle_id } = req.params;
    const { child_id } = req.body as { child_id: string };
    if (!child_id) return res.status(400).json({ error: "child_id required" });
    await brPatch(TABLE_CYCLES, Number(cycle_id), { child_id });
    return res.status(200).json({ message: "Child linked to cycle" });
  } catch (err) {
    console.error("[Cycle] linkChildToCycle error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
