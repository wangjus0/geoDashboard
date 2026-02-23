"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverallProgressHandler = exports.getRecentQueriesHandler = exports.runScanHandler = void 0;
const queryStore_service_1 = require("../services/queryStore.service");
const scan_service_1 = require("../services/scan.service");
const models_1 = require("../types/models");
const buildQueryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const runScanHandler = async (req, res) => {
    const { query, models } = req.body;
    if (!query || !query.trim()) {
        res.status(400).json({ error: 'Query is required' });
        return;
    }
    const invalidModels = (models || []).filter((model) => !models_1.supportedModels.includes(model));
    if (invalidModels.length) {
        res.status(400).json({
            error: `Unsupported model(s): ${invalidModels.join(', ')}`,
            supportedModels: models_1.supportedModels,
        });
        return;
    }
    const results = await (0, scan_service_1.runModelScan)(query.trim(), models);
    const usedModels = models?.length ? models : [...models_1.supportedModels];
    const recentQuery = {
        id: buildQueryId(),
        text: query.trim(),
        timestamp: new Date().toISOString(),
        models: usedModels,
        results,
    };
    await (0, queryStore_service_1.saveQueryResult)(recentQuery);
    res.status(200).json({
        query: recentQuery,
        results,
    });
};
exports.runScanHandler = runScanHandler;
const getRecentQueriesHandler = async (req, res) => {
    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;
    const limit = typeof limitParam === 'string' ? Number(limitParam) : 20;
    const offset = typeof offsetParam === 'string' ? Number(offsetParam) : 0;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 20;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const { recentQueries, total } = await (0, queryStore_service_1.getRecentQueriesPage)(safeLimit, safeOffset);
    const nextOffset = safeOffset + recentQueries.length;
    res.status(200).json({
        count: recentQueries.length,
        recentQueries,
        offset: safeOffset,
        limit: safeLimit,
        total,
        hasMore: nextOffset < total,
    });
};
exports.getRecentQueriesHandler = getRecentQueriesHandler;
const getOverallProgressHandler = async (_req, res) => {
    const summary = await (0, queryStore_service_1.getOverallProgressSummary)();
    res.status(200).json(summary);
};
exports.getOverallProgressHandler = getOverallProgressHandler;
