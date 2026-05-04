import type { RequestHandler } from 'express';
import { readSessionFromRequest } from '../utils/auth.js';

export const requireAuth: RequestHandler = (req, res, next) => {
  const session = readSessionFromRequest(req);

  if (!session) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  next();
};
