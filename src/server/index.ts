import express from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './routes';

export function createServer(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Static frontend files
  app.use(express.static(path.join(process.cwd(), 'public')));

  // API routes
  app.use('/api', apiRouter);

  // SPA fallback — serve index.html for any non-API route
  app.get('*', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  return app;
}
