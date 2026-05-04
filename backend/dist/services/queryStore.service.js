"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverallProgressSummary = exports.getRecentQueriesPage = exports.getRecentQueries = exports.saveQueryResult = exports.getPool = void 0;
const pg_1 = require("pg");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const env_js_1 = require("../config/env.js");
const models_js_1 = require("../types/models.js");
let pool = null;
const localStorePath = path_1.default.resolve(process.cwd(), 'backend/data/query-store.json');
const isSupabaseDatabaseUrl = (databaseUrl) => databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com');
const getPool = () => {
    if (!env_js_1.env.databaseUrl) {
        throw new Error('DATABASE_URL is not configured');
    }
    if (!pool) {
        pool = new pg_1.Pool({
            connectionString: env_js_1.env.databaseUrl,
            ssl: isSupabaseDatabaseUrl(env_js_1.env.databaseUrl) ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pool;
};
exports.getPool = getPool;
const shouldUseLocalStore = () => env_js_1.env.queryStoreDriver === 'local' || !env_js_1.env.databaseUrl;
const normalizeArrayValue = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    return [];
};
const isRecord = (value) => typeof value === 'object' && value !== null;
const readLocalStore = async () => {
    try {
        const rawStore = await promises_1.default.readFile(localStorePath, 'utf8');
        const parsedStore = JSON.parse(rawStore);
        if (!isRecord(parsedStore)) {
            return { recentQueries: [] };
        }
        return {
            recentQueries: normalizeArrayValue(parsedStore.recentQueries),
        };
    }
    catch (error) {
        if (isRecord(error) && error.code === 'ENOENT') {
            return { recentQueries: [] };
        }
        throw error;
    }
};
const writeLocalStore = async (store) => {
    await promises_1.default.mkdir(path_1.default.dirname(localStorePath), { recursive: true });
    await promises_1.default.writeFile(localStorePath, `${JSON.stringify(store, null, 2)}\n`);
};
const getLocalQueries = async () => {
    const store = await readLocalStore();
    return [...store.recentQueries].sort((queryA, queryB) => new Date(queryB.timestamp).getTime() - new Date(queryA.timestamp).getTime());
};
const mapRowToRecentQuery = (row) => ({
    id: row.id,
    text: row.query_text,
    timestamp: new Date(row.queried_at).toISOString(),
    models: normalizeArrayValue(row.models),
    results: normalizeArrayValue(row.results),
});
const buildOverallProgressSummary = (rows) => {
    const modelStats = {
        chatgpt: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
        claude: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
        gemini: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
    };
    for (const row of rows) {
        const results = normalizeArrayValue(row.results);
        for (const result of results) {
            const model = result.model;
            if (!models_js_1.supportedModels.includes(model)) {
                continue;
            }
            const stats = modelStats[model];
            stats.totalScans += 1;
            if (result.mentioned) {
                stats.mentions += 1;
            }
            if (typeof result.rank === 'number') {
                stats.rankedCount += 1;
                stats.rankSum += result.rank;
            }
        }
    }
    return {
        totalQueries: rows.length,
        updatedAt: rows[0] ? new Date(rows[0].queried_at).toISOString() : null,
        models: models_js_1.supportedModels.map((model) => {
            const stats = modelStats[model];
            return {
                model,
                totalScans: stats.totalScans,
                mentionRate: stats.totalScans ? (stats.mentions / stats.totalScans) * 100 : 0,
                rankedRate: stats.totalScans ? (stats.rankedCount / stats.totalScans) * 100 : 0,
                averageRank: stats.rankedCount ? stats.rankSum / stats.rankedCount : null,
            };
        }),
    };
};
const saveQueryResult = async (queryResult) => {
    if (shouldUseLocalStore()) {
        const store = await readLocalStore();
        await writeLocalStore({
            recentQueries: [queryResult, ...store.recentQueries],
        });
        return;
    }
    const db = (0, exports.getPool)();
    await db.query(`
      insert into public.prompt_queries (id, query_text, queried_at, models, results)
      values ($1, $2, $3, $4::jsonb, $5::jsonb)
    `, [
        queryResult.id,
        queryResult.text,
        queryResult.timestamp,
        JSON.stringify(queryResult.models),
        JSON.stringify(queryResult.results),
    ]);
};
exports.saveQueryResult = saveQueryResult;
const getRecentQueries = async (limit = 10) => {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;
    if (shouldUseLocalStore()) {
        return (await getLocalQueries()).slice(0, safeLimit);
    }
    const db = (0, exports.getPool)();
    const result = await db.query(`
      select id, query_text, queried_at, models, results
      from public.prompt_queries
      order by queried_at desc
      limit $1
    `, [safeLimit]);
    return result.rows.map(mapRowToRecentQuery);
};
exports.getRecentQueries = getRecentQueries;
const getRecentQueriesPage = async (limit = 20, offset = 0) => {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
    if (shouldUseLocalStore()) {
        const queries = await getLocalQueries();
        return {
            recentQueries: queries.slice(safeOffset, safeOffset + safeLimit),
            total: queries.length,
        };
    }
    const db = (0, exports.getPool)();
    const [rowsResult, countResult] = await Promise.all([
        db.query(`
        select id, query_text, queried_at, models, results
        from public.prompt_queries
        order by queried_at desc
        limit $1 offset $2
      `, [safeLimit, safeOffset]),
        db.query('select count(*)::text as total from public.prompt_queries'),
    ]);
    return {
        recentQueries: rowsResult.rows.map(mapRowToRecentQuery),
        total: Number(countResult.rows[0]?.total || 0),
    };
};
exports.getRecentQueriesPage = getRecentQueriesPage;
const getOverallProgressSummary = async () => {
    if (shouldUseLocalStore()) {
        const queries = await getLocalQueries();
        return buildOverallProgressSummary(queries.map((query) => ({
            queried_at: query.timestamp,
            results: query.results,
        })));
    }
    const db = (0, exports.getPool)();
    const { rows } = await db.query(`
      select queried_at, results
      from public.prompt_queries
      order by queried_at desc
    `);
    return buildOverallProgressSummary(rows);
};
exports.getOverallProgressSummary = getOverallProgressSummary;
