"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runModelScan = void 0;
const env_js_1 = require("../config/env.js");
const models_js_1 = require("../types/models.js");
const aiProviders_service_js_1 = require("./aiProviders.service.js");
const extractRank = (text, companyName) => {
    const normalized = text.toLowerCase();
    if (!normalized.includes(companyName.toLowerCase()))
        return null;
    const hashRankMatch = text.match(/#\s?(\d{1,2})/);
    if (hashRankMatch?.[1])
        return Number(hashRankMatch[1]);
    const orderedMatch = text.match(/(?:^|\n|\s)(\d{1,2})[.)]\s+[^\n]*?/);
    if (orderedMatch?.[1])
        return Number(orderedMatch[1]);
    return 1;
};
const toSnippet = (text) => {
    if (!text)
        return null;
    return text.slice(0, 240);
};
const runSingleModelScan = async (model, query) => {
    try {
        const rawText = await (0, aiProviders_service_js_1.queryModel)(model, query);
        const mentioned = rawText.toLowerCase().includes(env_js_1.env.companyName.toLowerCase());
        return {
            model,
            mentioned,
            rank: extractRank(rawText, env_js_1.env.companyName),
            snippet: toSnippet(rawText),
            rawText,
        };
    }
    catch (error) {
        return {
            model,
            mentioned: false,
            rank: null,
            snippet: null,
            rawText: '',
            error: error instanceof Error ? error.message : 'Unexpected model error',
        };
    }
};
const runModelScan = async (query, models) => {
    const selectedModels = models?.length
        ? models.filter((model) => models_js_1.supportedModels.includes(model))
        : [...models_js_1.supportedModels];
    const results = await Promise.all(selectedModels.map((model) => runSingleModelScan(model, query)));
    return results;
};
exports.runModelScan = runModelScan;
