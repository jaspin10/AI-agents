# M5 Punch List — NOT FULLY CLOSED (Step 13 of 14)

⚠ Read this before touching `packages/integrations/src/sync.ts`, `apps/slack/src/report.ts`, or any Railway service settings for this project.

## 1. `process.exit` fix ✅ NOW COMMITTED (verified Sept 9 2026)
The old bookmark said this fix existed only in a lost StackBlitz workspace. Verified against the actual repo — it was **half done**:

- `apps/slack/src/report.ts` — ✅ already had it (`.then(() => process.exit(0)).catch(... process.exit(1))`).
- `packages/integrations/src/sync.ts` — ❌ did NOT. It only set `process.exitCode = 1`, which is **not equivalent**: `exitCode` sets the code Node will use *when it eventually exits*, but does not force it to exit. Open Supabase/HTTP handles keep the event loop alive. **This was the actual cause of the hanging nightly-sync cron executions**, alongside the wrong start command (item 3).

Fixed on this branch: `main()` now returns `boolean` (success) instead of mutating `process.exitCode`, and the entry point calls `process.exit(ok ? 0 : 1)`, matching `report.ts`'s pattern. Failure semantics unchanged — a failed platform still exits 1.

⚠ **Not yet built or run.** `pnpm build` must pass and the compiled `dist/sync.js` must be what Railway executes. Verify before closing.

## 2–6. Railway configuration (still open — all dashboard work, cannot be done from a repo)
2. Stop the stuck "Running 1h+" execution on the `nightly-sync` service (if still stuck).
3. `nightly-sync` → Settings → Custom Start Command → `node packages/integrations/dist/sync.js`. It was running the bot server — the *other* root cause of the hang, independent of item 1. Both had to be wrong for the symptom; fix both.
4. `weekly-report` → verify Custom Start Command `node apps/slack/dist/report.js` and Cron Schedule `0 16 * * 1` (a "next in 14 hours" reading looked suspicious — confirm it fires Mondays).
5. Manual trigger of nightly-sync → expect ~2 min run + log line `tiktok: rotated refresh token persisted to tokens table` → SQL check: `select provider, updated_at from tokens;` → one tiktok row.
6. Add `LLM_MONTHLY_CAP=2000000` to the main service's Railway Variables. The hard-cap guard is coded but unconfigured — `report.ts` currently prints "(no cap set)" in the weekly Slack report, which is the visible symptom.

## 7. Step 14 — verification runbook
Definition-of-done is **2 consecutive successful nightly syncs**. Then write the M5 close-out into this file (and flip `02-built-status.md`'s cron line).

## 8. Minor open notes
- Node version: always `nvm use 20` in this repo (`.nvmrc` says 20), NOT 22 — the sibling portal repo needs 22. A Node 24 vs `.nvmrc` mismatch was noted previously.
- pnpm lockfile v9 quirk — was a StackBlitz artifact, now moot post-local-migration.
- Railway service renames pending.
- KPI-1 July 2026 spike (33 enrollments) uninvestigated.

**Sequencing note:** finish this punch list BEFORE `portal-integration.md`'s Step 4 (deploying `apps/api` + `apps/dash` to Railway) — same repo, same Railway project, and a healthy cron proves the deploy pattern the dash will reuse.
