# M5 Punch List — NOT FULLY CLOSED (Step 13 of 14)

⚠ Read this before touching `packages/integrations/src/sync.ts`, `apps/slack/src/report.ts`, or any Railway service settings for this project.

## 1. `process.exit` fix ✅ COMMITTED AND BUILT (verified Sept 9 2026)
The old bookmark said this fix existed only in a lost StackBlitz workspace. Verified against the actual repo — it was **half done**:

- `apps/slack/src/report.ts` — ✅ already had it (`.then(() => process.exit(0)).catch(... process.exit(1))`).
- `packages/integrations/src/sync.ts` — ❌ did NOT. It only set `process.exitCode = 1`, which is **not equivalent**: `exitCode` sets the code Node will use *when it eventually exits*, but does not force it to exit. Open Supabase/HTTP handles keep the event loop alive. **This was the actual cause of the hanging nightly-sync cron executions**, alongside the wrong start command (item 3).

`main()` now returns `boolean` (success) instead of mutating `process.exitCode`, and the entry point calls `process.exit(ok ? 0 : 1)`, matching `report.ts`'s pattern. Failure semantics unchanged — a failed platform still exits 1.

Merged to `milestone-2` (PR #1, squashed). Railway builds the repo itself — its `buildCommand` runs `pnpm build` — so no local build was required. Post-merge deploys of both `nightly-sync` and `weekly-report` succeeded.

## 2. Stuck execution ✅ CLEAR (verified Sept 9 2026)
No long-running execution present; `nightly-sync` shows Ready. Nothing to stop.

## 3. `nightly-sync` start command ✅ FIXED (Sept 9 2026)
Root cause confirmed: the service had **no** custom start command at all, so it fell through to `railway.json`'s `startCommand` (`node apps/slack/dist/index.js` — the bot server). Set to:

```
node packages/integrations/dist/sync.js
```

Note for future services: `railway.json`'s `deploy.startCommand` is the repo-wide default and is written for the orchestrator. Any cron service in this repo MUST set its own service-level start command or it will silently run the bot server.

## 4. `weekly-report` config ✅ FIXED (Sept 9 2026)
Cron schedule `0 16 * * 1` was already correct — the earlier "next in 14 hours" reading was a misread; the dashboard now shows "next in 5 days" (Monday), which matches.

The real fault, and the cause of the observed failed run: `node apps/slack/dist/report.js` had been entered as the service's **buildCommand**, not its startCommand. So the service never built the repo, and then started the bot server via the `railway.json` fallback. Corrected to:

- buildCommand: `npm install -g pnpm@10 && pnpm install --frozen-lockfile && pnpm build`
- startCommand: `node apps/slack/dist/report.js`

Second fault: the service had **zero** environment variables. `report.ts` throws immediately without `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`. Added 8 as Railway reference variables pointing at `nightly-sync` (`${{nightly-sync.NAME}}`), so there is one copy of each secret: the 3 Slack, 2 Supabase, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `LLM_ALLOW_BROWSER`.

The report service deliberately does NOT get the TikTok, YouTube or Stripe keys — it only reads aggregates out of Supabase.

## 5. Verification run (still open — needs a manual trigger)
Manual trigger of nightly-sync → expect ~2 min run + log line `tiktok: rotated refresh token persisted to tokens table` → SQL check: `select provider, updated_at from tokens;` → one tiktok row.

## 6. LLM cap ✅ SET (Sept 9 2026)
`LLM_MONTHLY_CAP=2000000` set on **both** `nightly-sync` and `weekly-report`. The punch list previously said "the main service", which was wrong on inspection of the code:

- `weekly-report` only *reads* the var, to render the cap line in the Slack report (`report.ts` — "(no cap set)" was the visible symptom).
- `nightly-sync` is the service that actually spends tokens, so it is where a cap can refuse a run.
- `@platform/orchestrator` is not involved.

### Related finding: `LLM_ALLOW_BROWSER` should not be on Railway
`packages/shared/src/llm.ts` documents `LLM_ALLOW_BROWSER=1` as a StackBlitz/WebContainers-only escape hatch that must never be set on real hosting. It was nonetheless present on `nightly-sync`. Set to `0` on both services (the code tests `=== '1'`, so `0` is inert). It should be **deleted outright** from both services in the Railway dashboard when convenient — the MCP integration can set variables but not remove them.

## 7. Step 14 — verification runbook
Definition-of-done is **2 consecutive successful nightly syncs**. Then write the M5 close-out into this file (and flip `02-built-status.md`'s cron line).

## 8. Minor open notes
- Node version: always `nvm use 20` in this repo (`.nvmrc` says 20), NOT 22 — the sibling portal repo needs 22. A Node 24 vs `.nvmrc` mismatch was noted previously.
- pnpm lockfile v9 quirk — was a StackBlitz artifact, now moot post-local-migration.
- Railway service renames pending.
- KPI-1 July 2026 spike (33 enrollments) uninvestigated.
- Railway project is `perfect-truth` (`5949c098-7ce0-469f-a4c2-4c1b5125d6e3`), environment `production`; services `nightly-sync`, `weekly-report`, `@platform/orchestrator`.

**Sequencing note:** finish this punch list BEFORE `portal-integration.md`'s Step 4 (deploying `apps/api` + `apps/dash` to Railway) — same repo, same Railway project, and a healthy cron proves the deploy pattern the dash will reuse.
