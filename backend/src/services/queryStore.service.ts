import { Pool } from 'pg';
import { env } from '../config/env';
import {
  OverallProgressSummary,
  RecentQuery,
  supportedModels,
  SupportedModel,
} from '../types/models';

type PromptQueryRow = {
  id: string;
  query_text: string;
  queried_at: Date | string;
  models: unknown;
  results: unknown;
};

let pool: Pool | null = null;

const getPool = (): Pool => {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
};

const normalizeArrayValue = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

const mapRowToRecentQuery = (row: PromptQueryRow): RecentQuery => ({
  id: row.id,
  text: row.query_text,
  timestamp: new Date(row.queried_at).toISOString(),
  models: normalizeArrayValue<RecentQuery['models'][number]>(row.models),
  results: normalizeArrayValue<RecentQuery['results'][number]>(row.results),
});

export const saveQueryResult = async (queryResult: RecentQuery): Promise<void> => {
  const db = getPool();
  await db.query(
    `
      insert into public.prompt_queries (id, query_text, queried_at, models, results)
      values ($1, $2, $3, $4::jsonb, $5::jsonb)
    `,
    [
      queryResult.id,
      queryResult.text,
      queryResult.timestamp,
      JSON.stringify(queryResult.models),
      JSON.stringify(queryResult.results),
    ],
  );
};

export const getRecentQueries = async (limit = 10): Promise<RecentQuery[]> => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;
  const db = getPool();
  const result = await db.query<PromptQueryRow>(
    `
      select id, query_text, queried_at, models, results
      from public.prompt_queries
      order by queried_at desc
      limit $1
    `,
    [safeLimit],
  );

  return result.rows.map(mapRowToRecentQuery);
};

export const getRecentQueriesPage = async (
  limit = 20,
  offset = 0,
): Promise<{ recentQueries: RecentQuery[]; total: number }> => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const db = getPool();

  const [rowsResult, countResult] = await Promise.all([
    db.query<PromptQueryRow>(
      `
        select id, query_text, queried_at, models, results
        from public.prompt_queries
        order by queried_at desc
        limit $1 offset $2
      `,
      [safeLimit, safeOffset],
    ),
    db.query<{ total: string }>('select count(*)::text as total from public.prompt_queries'),
  ]);

  return {
    recentQueries: rowsResult.rows.map(mapRowToRecentQuery),
    total: Number(countResult.rows[0]?.total || 0),
  };
};

export const getOverallProgressSummary = async (): Promise<OverallProgressSummary> => {
  const db = getPool();
  const { rows } = await db.query<{
    queried_at: Date | string;
    results: unknown;
  }>(
    `
      select queried_at, results
      from public.prompt_queries
      order by queried_at desc
    `,
  );

  const modelStats: Record<SupportedModel, {
    totalScans: number;
    mentions: number;
    rankedCount: number;
    rankSum: number;
  }> = {
    chatgpt: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
    claude: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
    gemini: { totalScans: 0, mentions: 0, rankedCount: 0, rankSum: 0 },
  };

  for (const row of rows) {
    const results = normalizeArrayValue<RecentQuery['results'][number]>(row.results);
    for (const result of results) {
      const model = result.model;
      if (!supportedModels.includes(model)) {
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
    models: supportedModels.map((model) => {
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
