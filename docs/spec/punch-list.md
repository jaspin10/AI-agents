# M5 Punch List — NOT FULLY CLOSED (Step 13 of 14 as of last bookmark)

⚠ Read this before touching `packages/integrations/src/sync.ts`, `apps/slack/src/report.ts`, or any Railway service settings for this project.

Remaining items (from the 2026-08-23 bookmark):

1. **Uncommitted fix, may need re-deriving:** `process.exit` added at the end of `packages/integrations/src/sync.ts` and `apps/slack/src/report.ts` so Railway cron executions actually terminate (they hang otherwise). These edits existed only in the old chat/StackBlitz workspace — if lost, re-derive: both scripts need an explicit `process.exit(0)` on success / `process.exit(1)` on failure after their `main()` completes, because open Supabase/HTTP handles keep Node alive. Then `pnpm build` → commit + push (`cron jobs: explicit process.exit so railway executions complete`). **Check the current state of these two files before assuming this is still needed — it may already be fixed.**
2. Stop the stuck "Running 1h+" execution on the `nightly-sync` Railway service (if still stuck).
3. `nightly-sync` → Settings → Custom Start Command → `node packages/integrations/dist/sync.js` (it was running the bot server — the root cause of the hang).
4. `weekly-report` → verify Custom Start Command `node apps/slack/dist/report.js` and Cron Schedule `0 16 * * 1` (a "next in 14 hours" reading looked suspicious — confirm it fires Mondays).
5. Manual trigger of nightly-sync → expect ~2 min run + log line `tiktok: rotated refresh token persisted to tokens table` → SQL check: `select provider, updated_at from tokens;` → one tiktok row.
6. Add `LLM_MONTHLY_CAP=2000000` to the main service's Railway Variables (weekly report flagged "no cap set" — the hard-cap guard is coded but unconfigured).
7. Step 14: verification runbook — definition-of-done is **2 consecutive successful nightly syncs** — then write the M5 close-out here.
8. Minor open notes: pnpm lockfile v9 quirk in StackBlitz (now moot post-local-migration) · Node 24 vs `.nvmrc` (says 20) mismatch — always `nvm use 20` in this repo, NOT 22 (the portal repo needs 22, this one needs 20) · Railway service renames pending · KPI-1 July 2026 spike (33 enrollments) uninvestigated.

**Sequencing note:** finish this punch list BEFORE portal-integration.md's Step 4 (deploying `apps/api` + `apps/dash` to Railway) — same repo, same Railway project, and a healthy cron proves the deploy pattern the dash will reuse.
