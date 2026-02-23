"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const model_controller_1 = require("../controllers/model.controller");
const router = (0, express_1.Router)();
router.post('/scan', model_controller_1.runScanHandler);
router.get('/recent-queries', model_controller_1.getRecentQueriesHandler);
router.get('/overall-summary', model_controller_1.getOverallProgressHandler);
exports.default = router;
