import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basicAuth } from 'hono/basic-auth';
import { createMemoryClient, monthlyKpis } from '@platform/memory';
import { createLogger } from '@platform/shared';
import { z } from 'zod';

const logger = createLogger('api');
const app = new Hono();

/**
 * Single-origin hosting (M4.5 Step 4): this process serves the built dash as
 * well as /api/*, so the browser never makes a cross-origin request and no
 * API base URL is needed. CORS therefore exists only for local `pnpm dash`,
 * where Vite runs on 5173 and proxies here. Any other origin is refused.
 */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  '/api/*',
  cors({
    origin: (origin) => (DEV_ORIGINS.includes(origin) ? origin : null),
  })
);

/**
 * Front door (M4.5, interim). ONE shared password over the whole surface —
 * dash and every /api/* route alike. This is not the per-role visibility
 * story: that decision is still open and lands in Step 5. This exists only
 * so the service can sit on a public URL without publishing revenue and
 * content data to anyone who finds it.
 *
 * FAILS CLOSED. With DASH_PASSWORD unset every request is refused, including
 * locally — a missing password must never mean an open door on a public host.
 * For local `pnpm dash`, put DASH_USER / DASH_PASSWORD in .env.
 */
const dashUser = process.env['DASH_USER'] ?? 'owner';
const dashPassword = process.env['DASH_PASSWORD'];

if (dashPassword === undefined || dashPassword.trim() === '') {
  logger.warn('DASH_PASSWORD unset — every request will be refused');
  app.use('*', async (c) =>
    c.text('DASH_PASSWORD is not set on this deployment — access refused.', 503)
  );
} else {
  app.use('*', basicAuth({ username: dashUser, password: dashPassword }));
}

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

/**
 * Static dash. Paths are relative to the process CWD, which on Railway is the
 * repo root (the start command is `node apps/api/dist/index.js`). Registered
 * AFTER /api/* so an API route always wins.
 */
const DASH_DIR = './apps/dash/dist';

app.use('/assets/*', serveStatic({ root: DASH_DIR }));

// SPA fallback — every non-API path returns index.html.
app.get('*', async (c) => {
  try {
    const html = await readFile(`${DASH_DIR}/index.html`, 'utf8');
    return c.html(html);
  } catch {
    return c.text('dash build not found — run `pnpm build` first', 500);
  }
});

const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  logger.info(
    `API + dash on port ${port}${writeToken === undefined || writeToken.trim() === '' ? ' (writes DISABLED — set API_WRITE_TOKEN)' : ''}`
  )
);
