# 2. What's Built ✅ (do not rebuild) & Open Items ⚠

## ✅ Built
- Orchestrator/agent-contract skeleton with full `agent_logs` auditing; unauthorized tool calls rejected at router level; no publish tool exists anywhere in the codebase (hard guardrail).
- Supabase memory layer, `brand-voice.md` embedded (8 chunks, pgvector, `match_brand_assets()`).
- Ingestion: TikTok Display API (Sandbox; ⚠ retention/watch-time permanently unavailable from the API — null forever, never inferred) · YouTube Data + Analytics APIs (retention available; consent screen published to Production so refresh tokens persist) · Stripe restricted read-only `rk_live_` key. `pnpm sync` idempotent, per-platform failure isolation.
- Analyst agent v1: reads content+performance, LLM generates 1–3 next-video suggestions, each passing two unskippable in-code LLM checks (banned topics + brand voice) before surfacing; rejected candidates persisted too.
- Slack delivery (Railway): weekly report to #analyst, `/nextvideo` with ✓/✗ interactive buttons wired end-to-end to suggestion status in SQL.
- Monthly KPI computation + endpoints; hard `LLM_MONTHLY_CAP` guard on the agent (⚠ coded but unconfigured on Railway — see `punch-list.md` item 6).

## ✅ Milestone 4.5: Read-only dashboard — COMPLETED 2026-08-18

**`apps/api` (@platform/api):** Hono read-only HTTP API on :8787 — `/api/suggestions`, `/api/content-performance`, `/api/kpis`, `/api/logs`. service_role key stays server-side; the browser never sees it.

**`apps/dash` (@platform/dash):** Vite+React dark dashboard (sidebar, purple accent), five panels:
- **Suggestions feed** — cards, check badges, status
- **Idea map v1** — suggestions as clickable nodes grouped by hypothesis tag, sticky detail pane (edges to source videos/outcomes deferred to M5+ feedback loop)
- **Performance table** — 192 videos, per-platform filter, sortable views/engagement/share/retention
- **KPIs** — lifetime counts with honest caveats (KPI2 has no source yet, KPI3 blocked on taxonomy v2)
- **Run log** — last 100 `agent_logs` rows with status badges + durations

`pnpm dash` starts API + Vite together.

### Locked decisions (2026-08-18)
- **API-server route (owner choice B):** browser never holds the service_role key; the Hono server is the shape M5 hosting will reuse.
- **Dashboard is READ-ONLY** — displays suggestions/data, triggers nothing. Suggestion actions (posted/skipped) intentionally deferred to M5 so the write path lands with its feedback-loop semantics, not ad hoc.
- `dash` package build script is a no-op in the workspace build (vite dev-server only until hosting).

### ⚠ CRITICAL BUG FOUND + FIXED via the dashboard
`performance.content_id` holds **platform-native video ids** (from the M3 sync), NOT content UUIDs. The M4 analyst joined on `content.id` → analysed **0 videos silently**; suggestions were brand-informed but data-blind. Join fixed to `content.platformVideoId` in `packages/agents/analyst/src/analysis.ts` and the dashboard Performance panel. Post-fix verified: the agent analyses all synced videos and cites real metrics in rationales.

⚠ The schema comment in `performance.ts` ("FK into the content table from M2") is **stale** — `content_id` remains the platform-native id. Formal FK migration deferred; M5+ decision: either migrate `performance.content_id` to UUIDs or amend the comment. **Any new join must go through `content.platformVideoId`.**

### Interfaces and contracts
- `GET /api/suggestions` → `SuggestionRow[]`
- `GET /api/content-performance` → `{content, performance}`
- `GET /api/kpis` → `{videos, tagged, enrollmentsCompleted, suggestionsSurfaced, suggestionsRejected}`
- `GET /api/logs` → last 100 `AgentLogRow` desc

### Files
`apps/api/{package.json, tsconfig.json, src/index.ts}` · `apps/dash/{package.json, vite.config.ts, index.html, src/{main.tsx, styles.css, App.tsx, api.ts, Suggestions.tsx, IdeaMap.tsx, Performance.tsx, Kpis.tsx, RunLog.tsx}}` · `packages/agents/analyst/src/analysis.ts` (join fix) · root `package.json` (dash script). Deps: hono, @hono/node-server (api); react, react-dom, vite, @vitejs/plugin-react (dash). Env vars added: **none** (API reuses `SUPABASE_*`).

### How to run/verify
`pnpm dash` → API on :8787 + dashboard on :5173; all five tabs render real data. `curl :8787/api/kpis` → `{videos:192, enrollmentsCompleted:124, ...}`. `pnpm suggest --count 1` → log line "analysed 192 videos" (not 0) and rationale cites concrete video metrics.

### Open items from 4.5
- M5: posted/skipped buttons on suggestion cards (writes status back) · monthly KPI breakdowns · **auth for the dashboard when hosted** (= integration Step 5) · Idea map edges (suggestion → source videos → outcome).
- `performance.content_id` semantics: migrate to UUID FK or amend schema comment (decide at M5).
- KPI `enrollmentsCompleted` counts lifetime, not monthly — M5 report adds monthly rates.

⚠ **Deployment gap:** `apps/api` + `apps/dash` are built and working but run ONLY as a local dev server. Hosting them on Railway is integration Step 4, blocked on `punch-list.md`. **This is why the portal's Marketing tab can't be built yet — there is no hosted URL to point it at.**

## ⚠ Open items inside the analyst project (pre-integration)
- Railway nightly-sync cron misconfigured — see `punch-list.md` (two independent causes: a wrong start command AND a missing `process.exit`; the code half is now fixed, the Railway half is not).
- Instagram blocked (external): the FB Page (645259428673564) sits in a business portfolio owned by the website contractor; Page is linked to the wrong IG profile. Resolution = contractor grants portfolio admin or transfers the Page. Env vars scoped (META_APP_ID/SECRET/PAGE_ID/IG_USER_ID/ACCESS_TOKEN; System User token recommended). Also a standing business risk independent of this project.
- Hypothesis taxonomy v2: team member open-coding the 192-video back-catalogue; until consolidated, `content.hypothesis` stays NULL and `hypothesis-tags.csv` stays header-only. Tag enum is swappable by design (no hard-coded literals in prompts).
- TikTok refresh token rotates per sync; re-run `pnpm auth:tiktok` if auth fails after long gaps.
- Switch analyst Supabase to `sb_secret_` key at hosting (legacy `eyJ` JWT was a StackBlitz WebContainers workaround only).
- M6 (sales analyst) and M7 (loop hardening) unbuilt.
- KPI 1 discrepancy: Stripe shows 15–33 completed/month vs stated 60 baseline — e-transfer/manual invoices bypass Checkout; reconcile before day-90 review.
