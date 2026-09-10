import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { createMemoryClient, monthlyKpis, type ContentAnalysisRow } from '@platform/memory';
import { createLogger } from '@platform/shared';
import { z } from 'zod';

const logger = createLogger('api');

/* ------------------------------------------------------------------ */
/* Auth model (X0 — docs/spec/x-series.md, portal-integration.md)      */
/* ------------------------------------------------------------------ */
/**
 * The dash has NO login of its own. The only door is the portal:
 *
 *   1. The portal's `dash-token` Edge Function checks the caller's real
 *      Supabase session, reads profiles.role, and mints a 60-second
 *      HS256 "handoff" token signed with DASH_TOKEN_SECRET.
 *   2. The browser lands on GET /auth/handoff?token=… . We verify the
 *      signature, check the claims, burn the jti (single use), and set our
 *      own httpOnly session cookie (12h, also HS256 with the same secret).
 *   3. Every later request is authenticated by that cookie. Roles gate each
 *      route (see requireRole). Nothing is re-verified against the portal.
 *
 * With no cookie and no token: pages bounce to the portal, /api/* answers
 * 401 JSON. There is no login form and no password gate anywhere on this
 * surface — the portal is the only door, permanently. Locked by Jas
 * 2026-09-10, verified end to end 2026-09-10 (handoff ok: owner
 * learn@frenchwithjas.ca), and DASH_PASSWORD retired the same day. The
 * interim HTTP Basic fallback (`/auth/basic`) that bridged the switchover
 * is gone — this is the permanent shape.
 */

const DASH_ROLES = ['owner', 'marketing'] as const;
type DashRole = (typeof DASH_ROLES)[number];

interface DashAuth {
  role: DashRole;
  email: string;
  via: 'session' | 'dev';
}

type Env = { Variables: { auth: DashAuth | null } };

const TOKEN_ISSUER = 'fwj-portal';
const TOKEN_AUDIENCE = 'analyst-dash';
const SESSION_COOKIE = 'dash_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h — locked 2026-09-10
const HANDOFF_JTI_REMEMBER_SECONDS = 5 * 60; // ≥ token lifetime; bounds the replay set

const tokenSecret = process.env['DASH_TOKEN_SECRET'];
const tokenSecretOk = tokenSecret !== undefined && tokenSecret.trim().length >= 32;
const portalUrl = process.env['PORTAL_URL'] ?? 'https://portal.frenchwithjas.ca/analytics';
const onRailway = process.env['RAILWAY_ENVIRONMENT'] !== undefined;

if (!tokenSecretOk) {
  logger.warn('DASH_TOKEN_SECRET unset or shorter than 32 chars — portal handoff DISABLED');
}

const HandoffClaims = z.object({
  iss: z.literal(TOKEN_ISSUER),
  aud: z.literal(TOKEN_AUDIENCE),
  typ: z.literal('handoff'),
  sub: z.string().min(1),
  email: z.string(),
  role: z.enum(DASH_ROLES),
  jti: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

const SessionClaims = z.object({
  iss: z.literal(TOKEN_AUDIENCE),
  typ: z.literal('session'),
  sub: z.string().min(1),
  email: z.string(),
  role: z.enum(DASH_ROLES),
  iat: z.number(),
  exp: z.number(),
});

/** Single-use guard for handoff tokens. In-memory is enough: one replica, 60s tokens. */
const usedJti = new Map<string, number>();

function burnJti(jti: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, seenAt] of usedJti) {
    if (now - seenAt > HANDOFF_JTI_REMEMBER_SECONDS) usedJti.delete(key);
  }
  if (usedJti.has(jti)) return false;
  usedJti.set(jti, now);
  return true;
}

async function issueSession(c: Context<Env>, who: { sub: string; email: string; role: DashRole }): Promise<void> {
  if (!tokenSecretOk || tokenSecret === undefined) throw new Error('DASH_TOKEN_SECRET missing');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await sign(
    {
      iss: TOKEN_AUDIENCE,
      typ: 'session',
      sub: who.sub,
      email: who.email,
      role: who.role,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    },
    tokenSecret,
    'HS256'
  );
  setCookie(c, SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: onRailway,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function authFromSessionCookie(c: Context<Env>): Promise<DashAuth | null> {
  if (!tokenSecretOk || tokenSecret === undefined) return null;
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw === undefined || raw === '') return null;
  try {
    const payload = await verify(raw, tokenSecret, 'HS256');
    const parsed = SessionClaims.safeParse(payload);
    if (!parsed.success) return null;
    return { role: parsed.data.role, email: parsed.data.email, via: 'session' };
  } catch {
    return null;
  }
}

/** Local dev only. Ignored on Railway, always. */
function authFromDevRole(): DashAuth | null {
  if (onRailway) return null;
  const role = process.env['DASH_DEV_ROLE'];
  if (role === 'owner' || role === 'marketing') {
    return { role, email: `dev-${role}@localhost`, via: 'dev' };
  }
  return null;
}

function requireRole(...roles: DashRole[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (auth === null) return c.json({ error: 'unauthorized' }, 401);
    if (!roles.includes(auth.role)) {
      logger.warn(`forbidden: ${auth.role} → ${c.req.method} ${c.req.path}`);
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  };
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const app = new Hono<Env>();

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

// Resolve who is calling, once, for every request.
app.use('*', async (c, next) => {
  const fromCookie = await authFromSessionCookie(c);
  c.set('auth', fromCookie ?? authFromDevRole());
  await next();
});

/** Portal → dash handoff. Any failure bounces to the portal (locked: no message, no login). */
app.get('/auth/handoff', async (c) => {
  const token = c.req.query('token');
  if (!tokenSecretOk || tokenSecret === undefined) {
    logger.warn('handoff refused: DASH_TOKEN_SECRET not configured');
    return c.redirect(portalUrl, 302);
  }
  if (token === undefined || token === '') {
    return c.redirect(portalUrl, 302);
  }
  try {
    const payload = await verify(token, tokenSecret, 'HS256');
    const parsed = HandoffClaims.safeParse(payload);
    if (!parsed.success) {
      logger.warn('handoff refused: claims did not match');
      return c.redirect(portalUrl, 302);
    }
    if (!burnJti(parsed.data.jti)) {
      logger.warn('handoff refused: token already used');
      return c.redirect(portalUrl, 302);
    }
    await issueSession(c, { sub: parsed.data.sub, email: parsed.data.email, role: parsed.data.role });
    logger.info(`handoff ok: ${parsed.data.role} ${parsed.data.email}`);
    return c.redirect('/', 302);
  } catch (error) {
    // error.name only (JwtTokenExpired, JwtTokenSignatureMismatched, …): hono's
    // message embeds the token itself, and tokens must not land in Railway logs.
    logger.warn(`handoff refused: ${error instanceof Error ? error.name : 'invalid token'}`);
    return c.redirect(portalUrl, 302);
  }
});

// Every /api/* route needs a resolved caller. Role checks are per route below.
app.use('/api/*', async (c, next) => {
  if (c.get('auth') === null) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

const memory = createMemoryClient();

/** Who am I — lets the dash hide panels the caller cannot open. */
app.get('/api/me', requireRole('owner', 'marketing'), (c) => {
  const auth = c.get('auth');
  if (auth === null) return c.json({ error: 'unauthorized' }, 401);
  return c.json({ role: auth.role, email: auth.email });
});

const StatusBodySchema = z.object({
  status: z.enum(['posted', 'skipped']),
});

app.get('/api/suggestions', requireRole('owner', 'marketing'), async (c) => {
  const rows = await memory.suggestions.all();
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json(rows);
});

/**
 * Feedback write path (§2 loop): flips surfaced → posted | skipped.
 * Only these two target states are reachable over HTTP — surfaced/rejected are
 * agent-owned states and cannot be set from outside. Authenticated by the
 * session cookie + role (X0); the old static API_WRITE_TOKEN bearer is gone.
 */
app.post('/api/suggestions/:id/status', requireRole('owner', 'marketing'), async (c) => {
  const id = c.req.param('id');
  const parsed = StatusBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "body must be { status: 'posted' | 'skipped' }" }, 400);
  }
  await memory.suggestions.updateStatus(id, parsed.data.status);
  const auth = c.get('auth');
  logger.info(`suggestion ${id} → ${parsed.data.status} (${auth?.role ?? '?'} ${auth?.email ?? ''})`);
  return c.json({ ok: true, id, status: parsed.data.status });
});

app.get('/api/content-performance', requireRole('owner', 'marketing'), async (c) => {
  const [content, performance] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
  ]);
  return c.json({ content, performance });
});

/* ------------------------------------------------------------------ */
/* X1 — content analysis (docs/spec/x-series.md, X1)                   */
/* ------------------------------------------------------------------ */
/**
 * Owner + marketing, session cookie only. Platform-agnostic: nothing below
 * names a platform; the dash derives its filter from the distinct values it
 * receives. Every PUT also writes content.hook / .format / .hypothesis on the
 * matching content row — the only path that ever fills those columns.
 */

/** Seeded chips. The live list is this ∪ DISTINCT idea_source — new names need no deploy. */
const IDEA_SOURCE_SEEDS = ['AI agent', 'Jas', 'Eknoor', 'Loop Studio', 'Harman', 'Manjot', 'Other'];

const optionalText = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === null || v === '' ? null : v));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === null ? null : v));

const AnalysisBodySchema = z.object({
  description: optionalText,
  hookText: optionalText,
  format: optionalText,
  hasModel: z.boolean().nullable().optional().transform((v) => v ?? null),
  hasCta: z.boolean().nullable().optional().transform((v) => v ?? null),
  ctaType: optionalText,
  adBoosted: z.boolean().optional().transform((v) => v ?? false),
  adStartDate: optionalDate,
  adEndDate: optionalDate,
  adSpendCents: z.number().int().min(0).nullable().optional().transform((v) => v ?? null),
  /** Platform video id of the paired video (pasted by Eknoor). Resolved server-side to content.id. */
  crossPlatformVideoId: optionalText,
  ideaSource: optionalText,
});

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Hypothesis tag derived from the structured fields, so the suggestions agent
 * has something to group on today. X6 will auto-suggest richer tags from the
 * free-text description; until then this is the mechanical mapping.
 * e.g. "talking-head+model+cta:comment". Null when there is no format.
 */
function deriveHypothesis(a: { format: string | null; hasModel: boolean | null; hasCta: boolean | null; ctaType: string | null }): string | null {
  if (a.format === null) return null;
  const parts = [slug(a.format)];
  if (a.hasModel === true) parts.push('model');
  if (a.hasCta === true) parts.push(a.ctaType === null ? 'cta' : `cta:${slug(a.ctaType)}`);
  return parts.join('+');
}

/** Canonicalise an idea_source against what already exists (case-insensitive), so "jas" → "Jas". */
function canonicalIdeaSource(input: string | null, known: string[]): string | null {
  if (input === null) return null;
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return null;
  const hit = known.find((k) => k.toLowerCase() === trimmed.toLowerCase());
  return hit ?? trimmed;
}

app.get('/api/analysis', requireRole('owner', 'marketing'), async (c) => {
  const [content, performance, analyses, savedSources] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
    memory.contentAnalysis.all(),
    memory.contentAnalysis.distinctIdeaSources(),
  ]);
  // Latest snapshot per video. Join key is platformVideoId (CLAUDE.md rule).
  const latest = new Map<string, (typeof performance)[number]>();
  for (const p of performance) {
    const prev = latest.get(p.contentId);
    if (prev === undefined || p.capturedDate > prev.capturedDate) latest.set(p.contentId, p);
  }
  const byId = new Map(content.map((r) => [r.id ?? '', r] as const));
  const analysisByContent = new Map(analyses.map((a) => [a.contentId, a] as const));
  const videos = content
    .filter((r) => r.id !== undefined)
    .map((r) => {
      const p = latest.get(r.platformVideoId);
      const a = analysisByContent.get(r.id ?? '') ?? null;
      const ref = a?.crossPlatformRef === null || a === null ? null : byId.get(a.crossPlatformRef) ?? null;
      return {
        id: r.id,
        platform: r.platform,
        platformVideoId: r.platformVideoId,
        title: r.title,
        postedAt: r.postedAt,
        metrics: p === undefined ? null : { capturedDate: p.capturedDate, ...p.metrics },
        analysis: a,
        crossPlatformRefVideo:
          ref === null ? null : { id: ref.id, platform: ref.platform, platformVideoId: ref.platformVideoId, title: ref.title },
      };
    })
    .sort((x, y) => y.postedAt.localeCompare(x.postedAt));
  const ideaSources = [...new Set([...IDEA_SOURCE_SEEDS, ...savedSources])];
  return c.json({ videos, ideaSources });
});

/** Echo for the paste-ID cross-platform picker. Any platform; the pairing rule is checked on PUT. */
app.get('/api/analysis/ref/:platformVideoId', requireRole('owner', 'marketing'), async (c) => {
  const row = await memory.content.findByPlatformVideoId(c.req.param('platformVideoId').trim());
  if (row === null) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, platform: row.platform, platformVideoId: row.platformVideoId, title: row.title, postedAt: row.postedAt });
});

/** Upsert one analysis. Editable after submit (locked): saving again refreshes analysed_at. */
app.put('/api/analysis/:contentId', requireRole('owner', 'marketing'), async (c) => {
  const auth = c.get('auth');
  if (auth === null) return c.json({ error: 'unauthorized' }, 401);
  const contentId = c.req.param('contentId');
  const parsed = AnalysisBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const content = await memory.content.all();
  const target = content.find((r) => r.id === contentId);
  if (target === undefined) return c.json({ error: 'unknown_content' }, 404);

  let crossPlatformRef: string | null = null;
  if (body.crossPlatformVideoId !== null) {
    const paired = await memory.content.findByPlatformVideoId(body.crossPlatformVideoId);
    if (paired === null || paired.id === undefined) return c.json({ error: 'ref_not_found' }, 400);
    if (paired.id === contentId) return c.json({ error: 'ref_is_self' }, 400);
    if (paired.platform === target.platform) return c.json({ error: 'ref_same_platform' }, 400);
    crossPlatformRef = paired.id;
  }

  if (body.adStartDate !== null && body.adEndDate !== null && body.adEndDate < body.adStartDate) {
    return c.json({ error: 'ad_end_before_start' }, 400);
  }

  const known = [...IDEA_SOURCE_SEEDS, ...(await memory.contentAnalysis.distinctIdeaSources())];
  const row: ContentAnalysisRow = {
    contentId,
    description: body.description,
    hookText: body.hookText,
    format: body.format,
    hasModel: body.hasModel,
    hasCta: body.hasCta,
    ctaType: body.hasCta === true ? body.ctaType : null,
    adBoosted: body.adBoosted,
    adStartDate: body.adBoosted ? body.adStartDate : null,
    adEndDate: body.adBoosted ? body.adEndDate : null,
    adSpendCents: body.adBoosted ? body.adSpendCents : null,
    crossPlatformRef,
    ideaSource: canonicalIdeaSource(body.ideaSource, known),
    analysedBy: auth.email,
    analysedAt: new Date().toISOString(),
  };
  await memory.contentAnalysis.upsert(row);
  // Required (X1): the structured fields are the only source for these columns.
  const hypothesis = deriveHypothesis(row);
  await memory.content.setTags(contentId, { hook: row.hookText, format: row.format, hypothesis });
  logger.info(`analysis saved: ${target.platform} ${target.platformVideoId} by ${auth.email}`);
  return c.json({ ok: true, analysis: row, tags: { hook: row.hookText, format: row.format, hypothesis } });
});

/** Revenue-adjacent (enrollment counts): owner only — locked, no marketing view of this route. */
app.get('/api/kpis', requireRole('owner'), async (c) => {
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

/** M5: per-month breakdowns incl. revenueCents — owner only. */
app.get('/api/kpis/monthly', requireRole('owner'), async (c) => {
  const months = Number(c.req.query('months') ?? '6');
  const rows = await monthlyKpis(memory, Number.isFinite(months) && months > 0 ? months : 6);
  return c.json(rows);
});

/** Engineering debug view — owner only (locked: marketing gets no Run log). */
app.get('/api/logs', requireRole('owner'), async (c) => {
  const store = await import('@platform/memory').then((m) => m.createLogStore());
  const rows = await store.all();
  return c.json(rows.slice(-100).reverse());
});

/**
 * Static dash. Paths are relative to the process CWD, which on Railway is the
 * repo root (the start command is `node apps/api/dist/index.js`). Registered
 * AFTER /api/* so an API route always wins. No session → straight to the
 * portal, nothing else (locked 2026-09-10).
 */
const DASH_DIR = './apps/dash/dist';

app.use('*', async (c, next) => {
  if (c.get('auth') === null) return c.redirect(portalUrl, 302);
  await next();
});

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
    `API + dash on port ${port}` +
      (tokenSecretOk ? '' : ' (portal handoff DISABLED — set DASH_TOKEN_SECRET)')
  )
);
