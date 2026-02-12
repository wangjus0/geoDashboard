import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import modelRoutes from './routes/model.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/models', modelRoutes);

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
