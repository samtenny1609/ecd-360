"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.childrenRoutes = void 0;
const express_1 = require("express");
const validate_1 = require("../middlewares/validate");
const requireAuth_1 = require("../middlewares/requireAuth");
const schemas_1 = require("../controllers/schemas");
const children_controller_1 = require("../controllers/children.controller");
exports.childrenRoutes = (0, express_1.Router)();
// All children routes require authentication
exports.childrenRoutes.use(requireAuth_1.requireAuth);
// POST /v1/children
exports.childrenRoutes.post("/", (0, validate_1.validateBody)(schemas_1.createChildSchema), children_controller_1.createChild);
// GET /v1/children
exports.childrenRoutes.get("/", children_controller_1.listChildren);
// DELETE /v1/children/:child_id
exports.childrenRoutes.delete("/:child_id", children_controller_1.deleteChild);
// GET /v1/children/:child_id/export
exports.childrenRoutes.get("/:child_id/export", children_controller_1.exportChildData);
