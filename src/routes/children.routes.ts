import { Router } from "express";
import { validateBody } from "../middlewares/validate";
import { requireAuth } from "../middlewares/requireAuth";
import { createChildSchema } from "../controllers/schemas";
import {
  createChild,
  listChildren,
  deleteChild,
  exportChildData,
} from "../controllers/children.controller";

export const childrenRoutes = Router();

// All children routes require authentication
childrenRoutes.use(requireAuth);

// POST /v1/children
childrenRoutes.post("/", validateBody(createChildSchema), createChild);

// GET /v1/children
childrenRoutes.get("/", listChildren);

// DELETE /v1/children/:child_id
childrenRoutes.delete("/:child_id", deleteChild);

// GET /v1/children/:child_id/export
childrenRoutes.get("/:child_id/export", exportChildData);
