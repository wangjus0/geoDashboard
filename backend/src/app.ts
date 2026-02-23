import express from 'express';
import cors from 'cors';
import modelRoutes from './routes/model.routes';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/models', modelRoutes);

  return app;
};
