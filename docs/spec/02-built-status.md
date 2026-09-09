# 2. What's Built ✅ (do not rebuild) & Open Items ⚠

## ✅ Built
- Orchestrator/agent-contract skeleton with full `agent_logs` auditing; unauthorized tool calls rejected at router level; no publish tool exists anywhere in the codebase (hard guardrail).
- Supabase memory layer, `brand-voice.md` embedded (8 chunks, pgvector, `match_brand_assets()`).
- Ingestion: TikTok Display API (Sandbox; ⚠ retention/watch-time permanently unavailable from the API — null forever, never inferred) · YouTube Data + Analytics APIs (retention available; consent screen published to Production so refresh tokens persist) · Stripe restricted read-only `rk_live_` key. `pnpm sync` idempotent, per-platform failure isolation.
- Analyst agent v1: reads content+performance, LLM generates 1–3 next-video suggestions, each passing two unskippable in-code LLM checks (banned topics + brand voice) before surfacing; rejected candidates persisted too. ⚠ Critical fixed bug worth remembering: `performance.content_id` holds platform-native video ids, not content UUIDs — all joins go through `content.platformVideoId`.
- Slack delivery (Railway): weekly report to #analyst, `/nextvideo` with ✓/✗ interactive buttons wired end-to-end to suggestion status in SQL.
- Monthly KPI computation + endpoints; hard `LLM_MONTHLY_CAP` guard on the agent.
- Dashboard (local only) with suggestion status buttons and KPI table.

## ⚠ Open items inside the analyst project (pre-integration)
- Railway nightly-sync cron misconfigured — launches the bot server instead of the sync script. See `punch-list.md`.
- Instagram blocked (external): the FB Page (645259428673564) sits in a business portfolio owned by the website contractor; Page is linked to the wrong IG profile. Resolution = contractor grants portfolio admin or transfers the Page. Env vars scoped (META_APP_ID/SECRET/PAGE_ID/IG_USER_ID/ACCESS_TOKEN; System User token recommended). Also a standing business risk independent of this project.
- Hypothesis taxonomy v2: team member open-coding the 192-video back-catalogue; until consolidated, `content.hypothesis` stays NULL and `hypothesis-tags.csv` stays header-only. Tag enum is swappable by design (no hard-coded literals in prompts).
- TikTok refresh token rotates per sync; re-run `pnpm auth:tiktok` if auth fails after long gaps.
- Switch analyst Supabase to `sb_secret_` key at hosting (legacy `eyJ` JWT was a StackBlitz WebContainers workaround only).
- M6 (sales analyst) and M7 (loop hardening) unbuilt.
- KPI 1 discrepancy: Stripe shows 15–33 completed/month vs stated 60 baseline — e-transfer/manual invoices bypass Checkout; reconcile before day-90 review.
