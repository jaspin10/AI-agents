# 1. What This Is & Architecture

An AI ANALYST/STRATEGIST for the marketing side of the French With Jas business. It never publishes content and never talks to students — read-only ingestion, human-in-the-loop always. Jobs: (1) ingest TikTok/YouTube/Stripe performance data nightly, (2) determine which videos worked and why (content vs. luck), (3) suggest next videos (theme/hook/format/hypothesis tag) that pass LLM-based banned-topics + brand-voice checks, (4) M6 (unbuilt): analyze exported sales conversations, per-archetype sales structures, lost-lead patterns. Delivery today: Slack bot in #analyst + local React dashboard.

## Stack (⚠ DIFFERENT from the portal in every dimension)
Repo: `github.com/jaspin10/AI-agents`, working branch **`milestone-2`** (main is an older skeleton — do not build against main).

TypeScript strict (portal is no-TS) · pnpm monorepo with workspaces · Zod v4 · Hono · Vite+React dash · Anthropic SDK (claude-sonnet-4-6) · Voyage AI embeddings (voyage-3.5, 1024 dims — not 1536).

## Database
Its OWN Supabase project — strictly separate from the portal DB by design; never merge them. Tables: `brand_assets` (embedded brand constitution), `content` (192 videos), `performance` (per-video per-UTC-day snapshots), `enrollments` (776 Stripe checkout sessions), `conversations` (empty until M6, pseudonym-only), `demo_log`, `agent_logs` (full audit trail), `suggestions` (status: surfaced/rejected/posted/skipped), `tokens`, `llm_usage`.

## Hosting
Railway (⚠ fresh GitHub-connected services only — "Upstream Repo/template" mode does NOT read pushed commits). Slack bot is live there. `apps/api` + `apps/dash` are NOT yet deployed — dash runs only as local Vite dev server. This is the main deployment gap, and the integration's Step 4.

## Repo structure
`apps/orchestrator` (router enforcing per-agent `allowedTools` on every call) · `apps/api` (Hono read-only :8787: /api/suggestions, /api/content-performance, /api/kpis, /api/logs) · `apps/dash` (dark dashboard: Suggestions feed, Idea map, Performance table, KPIs, Run log) · `apps/slack` (Hono server, signature verification, /nextvideo slash command, weekly report) · `packages/shared` (Zod schemas) · `packages/memory` (Supabase client) · `packages/integrations` (TikTok/YouTube/Stripe clients) · `packages/agents/analyst`.

Also present on `milestone-2` (not in the original architecture note): `data/` and `supabase/` directories at repo root, and `railway.json`.
