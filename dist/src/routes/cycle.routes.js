"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cycleRoutes = void 0;
const express_1 = require("express");
const validate_1 = require("../middlewares/validate");
const requireAuth_1 = require("../middlewares/requireAuth");
const schemas_1 = require("../controllers/schemas");
const cycle_controller_1 = require("../controllers/cycle.controller");
exports.cycleRoutes = (0, express_1.Router)();
// All cycle routes require authentication
exports.cycleRoutes.use(requireAuth_1.requireAuth);
// POST /v1/cycles/start
exports.cycleRoutes.post("/start", (0, validate_1.validateBody)(schemas_1.cycleStartBodySchema), cycle_controller_1.startCycle);
// POST /v1/cycles/:cycle_id/responses
exports.cycleRoutes.post("/:cycle_id/responses", (0, validate_1.validateBody)(schemas_1.submitResponsesSchema), cycle_controller_1.submitResponses);
// GET /v1/cycles/:cycle_id/summary
exports.cycleRoutes.get("/:cycle_id/summary", cycle_controller_1.fetchSummary);
// POST /v1/cycles/:cycle_id/end-early  [dev only — returns 404 in staging/production]
exports.cycleRoutes.post("/:cycle_id/end-early", cycle_controller_1.endEarly);
exports.cycleRoutes.get("/child/:child_id/active", requireAuth_1.requireAuth, cycle_controller_1.getActiveCycle);
exports.cycleRoutes.post("/:cycle_id/abandon", requireAuth_1.requireAuth, cycle_controller_1.abandonCycle);
