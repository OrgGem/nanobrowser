import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import rulesRouter from './routes.js';
import { initDatabase } from './database.js';

const PORT = parseInt(process.env.PORT ?? '3456', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app: Express = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

// Health-check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Rules API
app.use('/api/rules', rulesRouter);

// Global error handler – returns 500 for unexpected errors
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialise DB and start server
initDatabase();

app.listen(PORT, () => {
  console.log(`Nanobrowser orchestrator server running on http://localhost:${PORT}`);
});

export default app;
