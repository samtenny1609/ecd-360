import { Request, Response } from "express";
import { dbService } from "../services/db.service";
import { createChildSchema } from "./schemas";
import { t } from "../i18n";

const BASEROW_URL    = "https://api.baserow.io";
const BASEROW_TOKEN  = process.env.BASEROW_API_TOKEN!;
const TABLE_CYCLES   = 953216;
const TABLE_AUDITS   = 953219;

const brHeaders = () => ({
  "Authorization": `Token ${BASEROW_TOKEN}`,
  "Content-Type":  "application/json",
});

async function brFilter(tableId: number, field: string, value: string): Promise<any[]> {
  const url  = `${BASEROW_URL}/api/database/rows/table/${tableId}/?user_field_names=true&size=200&filter__${field}__equal=${encodeURIComponent(value)}`;
  const res  = await fetch(url, { headers: brHeaders() });
  if (!res.ok) throw new Error(`Baserow filter ${tableId} failed: ${res.status}`);
  const data = await res.json() as { results: any[] };
  return data.results ?? [];
}

export const createChild = async (req: Request, res: Response): Promise<void> => {
  try {
    const caregiver_id = res.locals.caregiver_id as string;
    const { pet_name, date_of_birth } = createChildSchema.parse(req.body);
    const child = await dbService.createChild({ pet_name, date_of_birth, caregiver_id });
    res.status(201).json(child);
  } catch (err) {
    console.error("[Children] createChild error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const listChildren = async (_req: Request, res: Response): Promise<void> => {
  try {
    const caregiver_id = res.locals.caregiver_id as string;
    const children = await dbService.getChildrenByCaregiver(caregiver_id);
    res.status(200).json(children);
  } catch (err) {
    console.error("[Children] listChildren error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const deleteChild = async (req: Request, res: Response): Promise<void> => {
  try {
    const child_id     = req.params.child_id;
    const caregiver_id = res.locals.caregiver_id as string;

    const child = await dbService.getChildById(child_id);
    if (!child) { res.status(404).json({ error: t("errors.child_not_found") }); return; }
    if (child.caregiver_id !== caregiver_id) { res.status(403).json({ error: t("errors.forbidden") }); return; }

    await dbService.deleteChildAndAllData(child_id);
    res.status(200).json({ message: "Child and all associated data deleted." });
  } catch (err) {
    console.error("[Children] deleteChild error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

export const exportChildData = async (req: Request, res: Response): Promise<void> => {
  try {
    const child_id     = req.params.child_id;
    const caregiver_id = res.locals.caregiver_id as string;

    const child = await dbService.getChildById(child_id);
    if (!child) { res.status(404).json({ error: t("errors.child_not_found") }); return; }
    if (child.caregiver_id !== caregiver_id) { res.status(403).json({ error: t("errors.forbidden") }); return; }

    const cycles = await brFilter(TABLE_CYCLES, "child_id", child_id);
    cycles.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

    const cycleResults = await Promise.all(
      cycles.map(async (cycle: any) => {
        const cycle_id = String(cycle.id);
        const audits   = await brFilter(TABLE_AUDITS, "cycle_id", cycle_id);
        return {
          cycle_id,
          start_date:          cycle.start_date as string,
          child_age_in_months: Number(cycle.child_age_in_months),
          ended_early:         Boolean(cycle.ended_early),
          results: audits.map((a: any) => ({
            domain:       a.domain as string,
            group_output: a.group_output as string,
          })),
        };
      })
    );

    res.status(200).json({
      child:  { pet_name: child.pet_name, date_of_birth: child.date_of_birth },
      cycles: cycleResults,
    });
  } catch (err) {
    console.error("[Children] exportChildData error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};

// ─── Guest child creation (no auth — first-time flow) ─────────────────────────
// POST /v1/children/guest-create
// Creates a child linked to a caregiver_id provided in the body.
// Used after contact collection to persist the guest child properly.
export const createGuestChild = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pet_name, date_of_birth, caregiver_id } = req.body as {
      pet_name: string;
      date_of_birth: string;
      caregiver_id: string;
    };
    if (!pet_name || !date_of_birth || !caregiver_id) {
      res.status(400).json({ error: "pet_name, date_of_birth and caregiver_id are required" });
      return;
    }
    const child = await dbService.createChild({ pet_name, date_of_birth, caregiver_id });
    res.status(201).json(child);
  } catch (err) {
    console.error("[Children] createGuestChild error:", err);
    res.status(500).json({ error: t("errors.internal_server_error") });
  }
};
