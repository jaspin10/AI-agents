import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMemoryClient } from '@platform/memory';
import { createLogger } from '@platform/shared';

const logger = createLogger('api');
const app = new Hono();

// Local dashboard only — Vite dev server origin.
app.use('/api/*', cors({ origin: (origin) => origin }));

const memory = createMemoryClient();

app.get('/api/suggestions', async (c) => {
  const rows = await memory.suggestions.all();
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(rows);
});

app.get('/api/content-performance', async (c) => {
  const [content, performance] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
  ]);
  return c.json({ content, performance });
});

app.get('/api/kpis', async (c) => {
  const [content, enrollments, suggestions] = await Promise.all([
    memory.content.all(),
    memory.enrollments.all(),
    memory.suggestions.all(),
  ]);
  return c.json({
    videos: content.length,
    tagged: content.filter((r) => r.hypothesis !== null).length,
    enrollmentsCompleted: enrollments.filter((e) => e.status === 'complete' || e.status === 'completed').length,
    suggestionsSurfaced: suggestions.filter((s) => s.status === 'surfaced').length,
    suggestionsRejected: suggestions.filter((s) => s.status === 'rejected').length,
  });
});

app.get('/api/logs', async (c) => {
  const store = await import('@platform/memory').then((m) => m.createLogStore());
  const rows = await store.all();
  return c.json(rows.slice(-100).reverse());
});

const port = 8787;
serve({ fetch: app.fetch, port }, () => logger.info(`read-only API on http://localhost:${port}`));