import { Router } from "express";
import { validateBody } from "../middlewares/validate";
import { requireAuth } from "../middlewares/requireAuth";
import { cycleStartBodySchema, submitResponsesSchema } from "../controllers/schemas";
import {
  startCycle,
  submitResponses,
  fetchSummary,
  endEarly,
  getActiveCycle,
  abandonCycle,
} from "../controllers/cycle.controller";

export const cycleRoutes = Router();

// All cycle routes require authentication
cycleRoutes.use(requireAuth);

// POST /v1/cycles/start
cycleRoutes.post("/start", validateBody(cycleStartBodySchema), startCycle);

// POST /v1/cycles/:cycle_id/responses
cycleRoutes.post("/:cycle_id/responses", validateBody(submitResponsesSchema), submitResponses);

// GET /v1/cycles/:cycle_id/summary
cycleRoutes.get("/:cycle_id/summary", fetchSummary);

// POST /v1/cycles/:cycle_id/end-early  [dev only — returns 404 in staging/production]
cycleRoutes.post("/:cycle_id/end-early", endEarly);

cycleRoutes.get("/child/:child_id/active", requireAuth, getActiveCycle);
cycleRoutes.post("/:cycle_id/abandon",     requireAuth, abandonCycle);