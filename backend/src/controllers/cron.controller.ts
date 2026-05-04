import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { runDailyTracking } from '../services/dailyTracking.service.js';

const getBearerToken = (authorizationHeader?: string) => {
  const [scheme, token] = authorizationHeader?.split(' ') ?? [];
  return scheme === 'Bearer' ? token : null;
};

const pacificHourFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  hour12: false,
  timeZone: 'America/Los_Angeles',
});

const pacificTimestampFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Los_Angeles',
});

const isPacificEightAmWindow = (date: Date) => pacificHourFormatter.format(date) === '08';

export const runDailyScanHandler = async (req: Request, res: Response): Promise<void> => {
  const token = getBearerToken(req.headers.authorization);

  if (!env.cronSecret || token !== env.cronSecret) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const now = new Date();
  if (!isPacificEightAmWindow(now)) {
    res.status(200).json({
      skipped: true,
      reason: 'outside_pacific_8am_window',
      utcTimestamp: now.toISOString(),
      pacificTimestamp: pacificTimestampFormatter.format(now),
    });
    return;
  }

  try {
    const result = await runDailyTracking();
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run daily scan';
    res.status(500).json({ error: message });
  }
};
