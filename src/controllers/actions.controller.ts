import { Request, Response } from "express";

const BASEROW_URL      = "https://api.baserow.io";
const BASEROW_TOKEN    = process.env.BASEROW_API_TOKEN!;
const TABLE_DOMAIN_ACTIONS = 953220;

interface DomainAction {
  action_id:   string;
  domain:      string;
  state:       string;
  explanation: string;
  actions:     string;
}

let cachedActions: DomainAction[] | null = null;
let isFetching = false;

export async function getCachedActions(): Promise<DomainAction[]> {
  if (cachedActions) return cachedActions;

  if (isFetching) {
    while (isFetching) await new Promise(r => setTimeout(r, 100));
    return cachedActions || [];
  }

  isFetching = true;
  try {
    const res  = await fetch(
      `${BASEROW_URL}/api/database/rows/table/${TABLE_DOMAIN_ACTIONS}/?user_field_names=true&size=200`,
      { headers: { "Authorization": `Token ${BASEROW_TOKEN}` } }
    );
    if (!res.ok) throw new Error(`Baserow DomainActions fetch failed: ${res.status}`);
    const data = await res.json() as { results: any[] };

    cachedActions = (data.results ?? []).map((r: any) => ({
      action_id:   String(r.action_id   ?? ""),
      domain:      String(r.domain      ?? ""),
      state:       String(r.state       ?? ""),
      explanation: String(r.explanation ?? ""),
      actions:     String(r.actions     ?? ""),
    }));

    console.log(`[Actions] Cached ${cachedActions.length} domain actions from Baserow`);
    return cachedActions;
  } catch (error) {
    console.error("[Actions] Failed to fetch DomainActions from Baserow:", error);
    return [];
  } finally {
    isFetching = false;
  }
}

export const getDomainActions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const actions = await getCachedActions();
    res.json(actions);
  } catch (error) {
    console.error("[Actions] getDomainActions error:", error);
    res.status(500).json({ error: "Failed to load domain actions" });
  }
};
