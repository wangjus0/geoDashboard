import { env } from '../config/env.js';
import { RecentQuery, SupportedModel, supportedModels } from '../types/models.js';
import type { Tables } from '../types/database.types.js';
import { runModelScan } from './scan.service.js';
import { getPool, saveQueryResult } from './queryStore.service.js';

type TrackedPromptRow = Pick<Tables<'tracked_prompts'>, 'id' | 'prompt_text' | 'models'>;
type DailyTrackingRunRow = Pick<Tables<'daily_tracking_runs'>, 'id'>;

type DailyTrackingPrompt = {
  id: string;
  text: string;
  models: SupportedModel[];
};

export type DailyTrackingResult = {
  runDate: string;
  totalPrompts: number;
  completed: number;
  skipped: number;
  failed: number;
  results: Array<{
    trackedPromptId: string;
    query: string;
    status: 'completed' | 'skipped' | 'failed';
    promptQueryId?: string;
    error?: string;
  }>;
};

const buildQueryId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const getUtcRunDate = () => new Date().toISOString().slice(0, 10);

const normalizeTrackedModels = (value: unknown): SupportedModel[] => {
  if (!Array.isArray(value)) {
    return [...supportedModels];
  }

  const models = value.filter((model): model is SupportedModel => supportedModels.includes(model));
  return models.length ? models : [...supportedModels];
};

const getActiveTrackedPrompts = async (): Promise<DailyTrackingPrompt[]> => {
  const safeLimit = Number.isFinite(env.dailyTrackingPromptLimit) && env.dailyTrackingPromptLimit > 0
    ? Math.min(env.dailyTrackingPromptLimit, 100)
    : 25;
  const db = getPool();
  const result = await db.query<TrackedPromptRow>(
    `
      select id, prompt_text, models
      from public.tracked_prompts
      where is_active = true
      order by created_at asc
      limit $1
    `,
    [safeLimit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    text: row.prompt_text,
    models: normalizeTrackedModels(row.models),
  }));
};

const startTrackingRun = async (
  trackedPromptId: string,
  runDate: string,
): Promise<string | null> => {
  const db = getPool();
  const result = await db.query<DailyTrackingRunRow>(
    `
      insert into public.daily_tracking_runs (
        tracked_prompt_id,
        run_date,
        status,
        started_at,
        updated_at
      )
      values ($1, $2::date, 'running', now(), now())
      on conflict (tracked_prompt_id, run_date)
      do update set
        status = 'running',
        error_message = null,
        started_at = now(),
        completed_at = null,
        updated_at = now()
      where public.daily_tracking_runs.status <> 'completed'
      returning id
    `,
    [trackedPromptId, runDate],
  );

  return result.rows[0]?.id ?? null;
};

const completeTrackingRun = async (runId: string, promptQueryId: string): Promise<void> => {
  const db = getPool();
  await db.query(
    `
      update public.daily_tracking_runs
      set
        status = 'completed',
        prompt_query_id = $2,
        error_message = null,
        completed_at = now(),
        updated_at = now()
      where id = $1
    `,
    [runId, promptQueryId],
  );
};

const failTrackingRun = async (runId: string, errorMessage: string): Promise<void> => {
  const db = getPool();
  await db.query(
    `
      update public.daily_tracking_runs
      set
        status = 'failed',
        error_message = $2,
        completed_at = now(),
        updated_at = now()
      where id = $1
    `,
    [runId, errorMessage.slice(0, 1000)],
  );
};

export const runDailyTracking = async (runDate = getUtcRunDate()): Promise<DailyTrackingResult> => {
  const prompts = await getActiveTrackedPrompts();
  const result: DailyTrackingResult = {
    runDate,
    totalPrompts: prompts.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const prompt of prompts) {
    const runId = await startTrackingRun(prompt.id, runDate);

    if (!runId) {
      result.skipped += 1;
      result.results.push({
        trackedPromptId: prompt.id,
        query: prompt.text,
        status: 'skipped',
      });
      continue;
    }

    try {
      const results = await runModelScan(prompt.text, prompt.models);
      const recentQuery: RecentQuery = {
        id: buildQueryId(),
        text: prompt.text,
        timestamp: new Date().toISOString(),
        models: prompt.models,
        results,
      };

      await saveQueryResult(recentQuery);
      await completeTrackingRun(runId, recentQuery.id);

      result.completed += 1;
      result.results.push({
        trackedPromptId: prompt.id,
        query: prompt.text,
        status: 'completed',
        promptQueryId: recentQuery.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Daily tracking failed';
      await failTrackingRun(runId, message);
      result.failed += 1;
      result.results.push({
        trackedPromptId: prompt.id,
        query: prompt.text,
        status: 'failed',
        error: message,
      });
    }
  }

  return result;
};
