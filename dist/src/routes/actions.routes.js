"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actionsRoutes = void 0;
const express_1 = require("express");
const actions_controller_1 = require("../controllers/actions.controller");
exports.actionsRoutes = (0, express_1.Router)();
// GET /v1/actions
exports.actionsRoutes.get("/", actions_controller_1.getDomainActions);
