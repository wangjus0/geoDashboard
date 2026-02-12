import { Request, Response } from 'express';
import { getRecentQueriesPage, saveQueryResult } from '../services/queryStore.service';
import { runModelScan } from '../services/scan.service';
import { ScanRequestBody, supportedModels } from '../types/models';

const buildQueryId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const runScanHandler = async (
  req: Request<unknown, unknown, ScanRequestBody>,
  res: Response,
): Promise<void> => {
  const { query, models } = req.body;

  if (!query || !query.trim()) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const invalidModels = (models || []).filter((model) => !supportedModels.includes(model));
  if (invalidModels.length) {
    res.status(400).json({
      error: `Unsupported model(s): ${invalidModels.join(', ')}`,
      supportedModels,
    });
    return;
  }

  const results = await runModelScan(query.trim(), models);
  const usedModels = models?.length ? models : [...supportedModels];

  const recentQuery = {
    id: buildQueryId(),
    text: query.trim(),
    timestamp: new Date().toISOString(),
    models: usedModels,
    results,
  };

  await saveQueryResult(recentQuery);

  res.status(200).json({
    query: recentQuery,
    results,
  });
};

export const getRecentQueriesHandler = async (req: Request, res: Response): Promise<void> => {
  const limitParam = req.query.limit;
  const offsetParam = req.query.offset;

  const limit = typeof limitParam === 'string' ? Number(limitParam) : 20;
  const offset = typeof offsetParam === 'string' ? Number(offsetParam) : 0;

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 20;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

  const { recentQueries, total } = await getRecentQueriesPage(safeLimit, safeOffset);
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
