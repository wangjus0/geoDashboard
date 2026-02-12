"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentQueriesPage = exports.getRecentQueries = exports.saveQueryResult = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const dataDir = path_1.default.resolve(process.cwd(), 'data');
const dataFilePath = path_1.default.join(dataDir, 'query-store.json');
const maxSavedQueries = 1000;
const defaultStore = {
    recentQueries: [],
};
const ensureDataFile = async () => {
    await fs_1.promises.mkdir(dataDir, { recursive: true });
    try {
        await fs_1.promises.access(dataFilePath);
    }
    catch {
        await fs_1.promises.writeFile(dataFilePath, JSON.stringify(defaultStore, null, 2), 'utf8');
    }
};
const readStore = async () => {
    await ensureDataFile();
    const data = await fs_1.promises.readFile(dataFilePath, 'utf8');
    try {
        const parsed = JSON.parse(data);
        return {
            recentQueries: parsed.recentQueries || [],
        };
    }
    catch {
        return defaultStore;
    }
};
const writeStore = async (store) => {
    await fs_1.promises.writeFile(dataFilePath, JSON.stringify(store, null, 2), 'utf8');
};
const saveQueryResult = async (queryResult) => {
    const store = await readStore();
    store.recentQueries = [queryResult, ...store.recentQueries].slice(0, maxSavedQueries);
    await writeStore(store);
};
exports.saveQueryResult = saveQueryResult;
const getRecentQueries = async (limit = 10) => {
    const store = await readStore();
    return store.recentQueries.slice(0, limit);
};
exports.getRecentQueries = getRecentQueries;
const getRecentQueriesPage = async (limit = 20, offset = 0) => {
    const store = await readStore();
    const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
    const recentQueries = store.recentQueries.slice(safeOffset, safeOffset + limit);
    return {
        recentQueries,
        total: store.recentQueries.length,
    };
};
exports.getRecentQueriesPage = getRecentQueriesPage;
