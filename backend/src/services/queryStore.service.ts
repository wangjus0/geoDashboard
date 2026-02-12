import { promises as fs } from 'fs';
import path from 'path';
import { QueryStore, RecentQuery } from '../types/models';

const dataDir = path.resolve(process.cwd(), 'data');
const dataFilePath = path.join(dataDir, 'query-store.json');
const maxSavedQueries = 1000;

const defaultStore: QueryStore = {
  recentQueries: [],
};

const ensureDataFile = async (): Promise<void> => {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.writeFile(dataFilePath, JSON.stringify(defaultStore, null, 2), 'utf8');
  }
};

const readStore = async (): Promise<QueryStore> => {
  await ensureDataFile();
  const data = await fs.readFile(dataFilePath, 'utf8');
  try {
    const parsed = JSON.parse(data) as QueryStore;
    return {
      recentQueries: parsed.recentQueries || [],
    };
  } catch {
    return defaultStore;
  }
};

const writeStore = async (store: QueryStore): Promise<void> => {
  await fs.writeFile(dataFilePath, JSON.stringify(store, null, 2), 'utf8');
};

export const saveQueryResult = async (queryResult: RecentQuery): Promise<void> => {
  const store = await readStore();
  store.recentQueries = [queryResult, ...store.recentQueries].slice(0, maxSavedQueries);
  await writeStore(store);
};

export const getRecentQueries = async (limit = 10): Promise<RecentQuery[]> => {
  const store = await readStore();
  return store.recentQueries.slice(0, limit);
};

export const getRecentQueriesPage = async (
  limit = 20,
  offset = 0,
): Promise<{ recentQueries: RecentQuery[]; total: number }> => {
  const store = await readStore();
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const recentQueries = store.recentQueries.slice(safeOffset, safeOffset + limit);

  return {
    recentQueries,
    total: store.recentQueries.length,
  };
};
