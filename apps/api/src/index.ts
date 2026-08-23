import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMemoryClient, monthlyKpis } from '@platform/memory';
import { createLogger } from '@platform/shared';
import { z } from 'zod';

const logger = createLogger('api');
const app = new Hono();

// Local dashboard only — Vite dev server origin.
app.use('/api/*', cors({ origin: (origin) => origin }));

const memory = createMemoryClient();

/**
 * M5: first write endpoint. Auth = single static bearer token (API_WRITE_TOKEN).
 * Deliberately minimal — one owner, one token; full auth story is M6+ hardening.
 * If the var is unset, ALL writes are refused (safe default for local dev).
 */
const writeToken = process.env['API_WRITE_TOKEN'];

function isAuthorized(header: string | undefined): boolean {
  if (writeToken === undefined || writeToken.trim() === '') return false;
  return header === `Bearer ${writeToken}`;
}

const StatusBodySchema = z.object({
  status: z.enum(['posted', 'skipped']),
});

app.get('/api/suggestions', async (c) => {
  const rows = await memory.suggestions.all();
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(rows);
});

/**
 * Feedback write path (§2 loop): flips surfaced → posted | skipped.
 * Only these two target states are reachable over HTTP — surfaced/rejected are
 * agent-owned states and cannot be set from outside.
 */
app.post('/api/suggestions/:id/status', async (c) => {
  if (!isAuthorized(c.req.header('authorization'))) {
    logger.warn('unauthorized write attempt on /api/suggestions/:id/status');
    return c.json({ error: 'unauthorized' }, 401);
  }
  const id = c.req.param('id');
  const parsed = StatusBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "body must be { status: 'posted' | 'skipped' }" }, 400);
  }
  await memory.suggestions.updateStatus(id, parsed.data.status);
  logger.info(`suggestion ${id} → ${parsed.data.status}`);
  return c.json({ ok: true, id, status: parsed.data.status });
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

/** M5: per-month breakdowns (Stripe-visible enrollments — see M3 KPI-1 caveat). */
app.get('/api/kpis/monthly', async (c) => {
  const months = Number(c.req.query('months') ?? '6');
  const rows = await monthlyKpis(memory, Number.isFinite(months) && months > 0 ? months : 6);
  return c.json(rows);
});

app.get('/api/logs', async (c) => {
  const store = await import('@platform/memory').then((m) => m.createLogStore());
  const rows = await store.all();
  return c.json(rows.slice(-100).reverse());
});

const port = 8787;
serve({ fetch: app.fetch, port }, () =>
  logger.info(
    `API on http://localhost:${port}${writeToken === undefined || writeToken.trim() === '' ? ' (writes DISABLED — set API_WRITE_TOKEN)' : ''}`
  )
);