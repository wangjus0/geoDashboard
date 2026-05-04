import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';
import {
  OverallProgressSummary,
  QueryStore,
  RecentQuery,
  supportedModels,
  SupportedModel,
} from '../types/models.js';
import type { Tables } from '../types/database.types.js';

type PromptQueryRow = Pick<Tables<'prompt_queries'>, 'id' | 'query_text' | 'queried_at' | 'models' | 'results'>;

let pool: Pool | null = null;
const localStorePath = path.resolve(process.cwd(), 'backend/data/query-store.json');
const isSupabaseDatabaseUrl = (databaseUrl: string) =>
  databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com');

export const getPool = (): Pool => {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: isSupabaseDatabaseUrl(env.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
};

const shouldUseLocalStore = () => env.queryStoreDriver === 'local' || !env.databaseUrl;

const normalizeArrayValue = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readLocalStore = async (): Promise<QueryStore> => {
  try {
    const rawStore = await fs.readFile(localStorePath, 'utf8');
    const parsedStore = JSON.parse(rawStore) as unknown;

    if (!isRecord(parsedStore)) {
      return { recentQueries: [] };
    }

    return {
      recentQueries: normalizeArrayValue<RecentQuery>(parsedStore.recentQueries),
    };
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return { recentQueries: [] };
    }

    throw error;
  }
};

const writeLocalStore = async (store: QueryStore): Promise<void> => {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, `${JSON.stringify(store, null, 2)}\n`);
};

const getLocalQueries = async (): Promise<RecentQuery[]> => {
  const store = await readLocalStore();
  return [...store.recentQueries].sort(
    (queryA, queryB) => new Date(queryB.timestamp).getTime() - new Date(queryA.timestamp).getTime(),
  );
};

const mapRowToRecentQuery = (row: PromptQueryRow): RecentQuery => ({
  id: row.id,
  text: row.query_text,
  timestamp: new Date(row.queried_at).toISOString(),
  models: normalizeArrayValue<RecentQuery['models'][number]>(row.models),
  results: normalizeArrayValue<RecentQuery['results'][number]>(row.results),
});

const buildOverallProgressSummary = (
  rows: Array<{ queried_at: Date | string; results: unknown }>,
): OverallProgressSummary => {
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

export const saveQueryResult = async (queryResult: RecentQuery): Promise<void> => {
  if (shouldUseLocalStore()) {
    const store = await readLocalStore();
    await writeLocalStore({
      recentQueries: [queryResult, ...store.recentQueries],
    });
    return;
  }

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

  if (shouldUseLocalStore()) {
    return (await getLocalQueries()).slice(0, safeLimit);
  }

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

  if (shouldUseLocalStore()) {
    const queries = await getLocalQueries();
    return {
      recentQueries: queries.slice(safeOffset, safeOffset + safeLimit),
      total: queries.length,
    };
  }

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
  if (shouldUseLocalStore()) {
    const queries = await getLocalQueries();
    return buildOverallProgressSummary(
      queries.map((query) => ({
        queried_at: query.timestamp,
        results: query.results,
      })),
    );
  }

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

  return buildOverallProgressSummary(rows);
};
