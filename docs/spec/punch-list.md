# M5 Punch List — NOT FULLY CLOSED (Step 13 of 14)

⚠ Read this before touching `packages/integrations/src/sync.ts`, `apps/slack/src/report.ts`, `railway*.json`, or any Railway service settings for this project.

## 1. `process.exit` fix ✅ COMMITTED AND BUILT (verified Sept 9 2026)
The old bookmark said this fix existed only in a lost StackBlitz workspace. Verified against the actual repo — it was **half done**:

- `apps/slack/src/report.ts` — ✅ already had it (`.then(() => process.exit(0)).catch(... process.exit(1))`).
- `packages/integrations/src/sync.ts` — ❌ did NOT. It only set `process.exitCode = 1`, which is **not equivalent**: `exitCode` sets the code Node will use *when it eventually exits*, but does not force it to exit. Open Supabase/HTTP handles keep the event loop alive.

`main()` now returns `boolean` (success) instead of mutating `process.exitCode`, and the entry point calls `process.exit(ok ? 0 : 1)`, matching `report.ts`'s pattern. Failure semantics unchanged — a failed platform still exits 1.

Merged to `milestone-2` (PR #1, squashed). Railway builds the repo itself — its `buildCommand` runs `pnpm build` — so no local build was required.

⚠ Note: this fix was **necessary but not sufficient**, and it was never the observed cause of the hangs. See item 3 — the container was never running `sync.js` at all.

## 2. Stuck execution ⚠ RECURRED (Sept 9 2026)
Was clear mid-afternoon, then the manual trigger for item 5 hung exactly like its predecessors (prior executions: 6h 45m, 23h 57m, 1d). Confirmed from deploy logs that the hung container is the **Slack bot server**, not the sync job:

```
[slack] slack app listening on :8080
```

A long-lived HTTP server has no reason to exit, so every "hang" in the execution history is this, not a Node event-loop leak. Kill any running execution before re-testing.

## 3. Start command — real root cause found (Sept 9 2026)
**First diagnosis (wrong):** the service had no custom start command, so it inherited `railway.json`'s. Setting a service-level start command appeared to fix it.

**Actual cause:** `railway.json` at the repo root is **config-as-code**, and Railway gives it precedence over service-level dashboard settings. It applies to *every* service built from this repo. Its `deploy.startCommand` is `node apps/slack/dist/index.js` — the orchestrator's bot server. So the service-level start command on `nightly-sync` was set correctly, showed correctly in the API, and was silently ignored at deploy time.

**Fix:** one config file per cron service, each pointed at from that service's Config-as-code path setting:

- `railway.sync.json` → `node packages/integrations/dist/sync.js` (service: `nightly-sync`)
- `railway.report.json` → `node apps/slack/dist/report.js` (service: `weekly-report`)
- `railway.json` stays as-is and now applies only to `@platform/orchestrator`, which genuinely is the bot server.

Neither cron file sets a healthcheck — cron jobs expose no port, and `railway.json`'s `/health` check does not apply to them.

⚠ **Standing rule for this repo:** a service-level start command in the Railway dashboard is NOT authoritative while a config-as-code file is in play. Any new service (including `apps/api` and `apps/dash` at integration Step 4) needs its own `railway.*.json` or it will run the bot server.

## 4. `weekly-report` config ✅ FIXED (Sept 9 2026)
Cron schedule `0 16 * * 1` was already correct — the earlier "next in 14 hours" reading was a misread; the dashboard shows "next in 5 days" (Monday), which matches.

The visible fault: `node apps/slack/dist/report.js` had been entered as the service's **buildCommand**, not its startCommand, so the service never built the repo. Corrected to a real build command, with the start command now coming from `railway.report.json` (see item 3).

Second fault: the service had **zero** environment variables. `report.ts` throws immediately without `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`. Added 8 as Railway reference variables pointing at `nightly-sync` (`${{nightly-sync.NAME}}`), so there is one copy of each secret: the 3 Slack, 2 Supabase, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `LLM_ALLOW_BROWSER`.

The report service deliberately does NOT get the TikTok, YouTube or Stripe keys — it only reads aggregates out of Supabase.

## 5. Verification run (still open — blocked on item 3 landing)
Cron Runs tab → **Run now**. Expect a ~2 min run that **ends**, plus the log line `tiktok: rotated refresh token persisted to tokens table` → SQL check: `select provider, updated_at from tokens;` → one tiktok row.

First attempt (Sept 9, 15:08 UTC) hung — it was the bot server. Re-test only after the item 3 config files are merged and each service's Config-as-code path is set.

Note: redeploying a cron service does NOT execute it — it only rebuilds and stages the image. The run must be triggered from Cron Runs or the schedule.

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
- Node version: `.nvmrc` says 20, and local work should use `nvm use 20` (the sibling portal repo needs 22). ⚠ Railway's Nixpacks builder does **not** honour `.nvmrc` — the Sept 9 build image used **Node 24.10.0**. The workspace compiles fine on it, but the runtime version is not what the repo declares.
- Build warning worth watching: pnpm reports `Ignored build scripts: esbuild`. Harmless for the tsc-built services; likely relevant when `apps/dash` is deployed at Step 4.
- pnpm lockfile v9 quirk — was a StackBlitz artifact, now moot post-local-migration.
- Railway service renames pending.
- KPI-1 July 2026 spike (33 enrollments) uninvestigated.
- Railway project is `perfect-truth` (`5949c098-7ce0-469f-a4c2-4c1b5125d6e3`), environment `production`; services `nightly-sync` (`382b7c6f-f8e9-4c0e-bd26-b45df63a05b5`), `weekly-report` (`7845773d-af1f-49bc-b3fd-d873a1ec4b5e`), `@platform/orchestrator` (`23f1a5fa-7d4c-48e3-bc6a-1e5d990aebbf`).

**Sequencing note:** finish this punch list BEFORE `portal-integration.md`'s Step 4 (deploying `apps/api` + `apps/dash` to Railway) — same repo, same Railway project, and a healthy cron proves the deploy pattern the dash will reuse.
