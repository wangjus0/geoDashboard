"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverallProgressSummary = exports.getRecentQueriesPage = exports.getRecentQueries = exports.saveQueryResult = void 0;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const models_1 = require("../types/models");
let pool = null;
const getPool = () => {
    if (!env_1.env.databaseUrl) {
        throw new Error('DATABASE_URL is not configured');
    }
    if (!pool) {
        pool = new pg_1.Pool({
            connectionString: env_1.env.databaseUrl,
            ssl: env_1.env.databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pool;
};
const normalizeArrayValue = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    return [];
};
const mapRowToRecentQuery = (row) => ({
    id: row.id,
    text: row.query_text,
    timestamp: new Date(row.queried_at).toISOString(),
    models: normalizeArrayValue(row.models),
    results: normalizeArrayValue(row.results),
});
const saveQueryResult = async (queryResult) => {
    const db = getPool();
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
    const db = getPool();
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
    const db = getPool();
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
    const db = getPool();
    const { rows } = await db.query(`
      select queried_at, results
      from public.prompt_queries
      order by queried_at desc
    `);
    const modelStats = {
        chatgpt: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
        claude: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
        gemini: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
    };
    for (const row of rows) {
        const results = normalizeArrayValue(row.results);
        for (const result of results) {
            const model = result.model;
            if (!models_1.supportedModels.includes(model)) {
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
        models: models_1.supportedModels.map((model) => {
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
exports.getOverallProgressSummary = getOverallProgressSummary;
