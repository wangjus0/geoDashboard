import { env } from './config/env';
import { createApp } from './app';

const app = createApp();

if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

export default app;
