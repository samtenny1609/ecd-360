import cron from "node-cron";
import { dbService } from "../services/db.service";
import { sendCycleReminderEmail } from "../services/email.service";

const BASEROW_URL   = "https://api.baserow.io";
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN!;
const TABLE_CAREGIVERS = 953163;

async function getCaregiverEmail(caregiver_id: string): Promise<string | null> {
  const url = `${BASEROW_URL}/api/database/rows/table/${TABLE_CAREGIVERS}/?user_field_names=true&filter__caregiver_id__equal=${encodeURIComponent(caregiver_id)}`;
  const res  = await fetch(url, { headers: { "Authorization": `Token ${BASEROW_TOKEN}` } });
  if (!res.ok) return null;
  const data = await res.json() as { results: any[] };
  return data.results?.[0]?.email ?? null;
}

export function initCycleReminderJob(): void {
  // 03:30 UTC = 09:00 IST
  cron.schedule("30 3 * * *", async () => {
    console.log("[CronJob] ─── Cycle reminder check started ───");

    try {
      const dueChildren = await dbService.getChildrenDueForReminder();
      console.log(`[CronJob] Found ${dueChildren.length} child(ren) due for reminder.`);

      for (const child of dueChildren) {
        try {
          const email = await getCaregiverEmail(child.caregiver_id);
          if (!email) {
            console.warn(`[CronJob] No caregiver email for caregiver_id=${child.caregiver_id}`);
            continue;
          }

          const nextCycleUrl = process.env.APP_URL ?? "https://parentzo-backend-production.up.railway.app";
          await sendCycleReminderEmail(email, child.pet_name, nextCycleUrl);
          await dbService.setCycleReminderSent(child.child_record_id);

          console.log(`[CronJob] Reminder dispatched for "${child.pet_name}" → ${email}`);
        } catch (childErr) {
          console.error(`[CronJob] Error processing child ${child.child_record_id}:`, childErr);
        }
      }
    } catch (fatalErr) {
      console.error("[CronJob] Fatal error:", fatalErr);
    }

    console.log("[CronJob] ─── Cycle reminder check complete ───");
  });

  console.log("[CronJob] Cycle reminder job scheduled (daily 09:00 IST / 03:30 UTC).");
}
