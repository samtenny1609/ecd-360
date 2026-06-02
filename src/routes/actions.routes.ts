import { Router } from "express";
import { getDomainActions } from "../controllers/actions.controller";

export const actionsRoutes = Router();

// GET /v1/actions
actionsRoutes.get("/", getDomainActions);
