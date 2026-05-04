import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import cronRoutes from './routes/cron.routes.js';
import modelRoutes from './routes/model.routes.js';
import { requireAuth } from './middlewares/auth.middleware.js';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS.'));
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/cron', cronRoutes);
  app.use('/api/models', requireAuth, modelRoutes);

  return app;
};
