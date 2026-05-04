import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

export default app;
