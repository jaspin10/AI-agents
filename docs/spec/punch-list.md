# M5 Punch List — items 1–6 CLOSED, item 7 awaiting scheduled runs (Step 13 of 14)

⚠ Read this before touching `packages/integrations/src/sync.ts`, `apps/slack/src/report.ts`, `railway.json`, or any Railway service settings for this project.

## 1. `process.exit` fix ✅ CLOSED (verified live Sept 9 2026)
The old bookmark said this fix existed only in a lost StackBlitz workspace. Verified against the actual repo — it was **half done**:

- `apps/slack/src/report.ts` — ✅ already had it (`.then(() => process.exit(0)).catch(... process.exit(1))`).
- `packages/integrations/src/sync.ts` — ❌ did NOT. It only set `process.exitCode = 1`, which is **not equivalent**: `exitCode` sets the code Node will use *when it eventually exits*, but does not force it to exit. Open Supabase/HTTP handles keep the event loop alive.

`main()` now returns `boolean` (success) instead of mutating `process.exitCode`, and the entry point calls `process.exit(ok ? 0 : 1)`, matching `report.ts`'s pattern. Failure semantics unchanged — a failed platform still exits 1. Merged in PR #1.

Proven live: the 16:59 UTC run printed its summary and the execution settled as succeeded rather than climbing. Note this fix was **necessary but not sufficient** — until item 3 was fixed, the container was never running `sync.js` at all, so the hangs seen all day were item 3's, not this one's.

## 2. Stuck executions ✅ CLOSED
Historic executions ran 6h 45m, 23h 57m and 1d. Cause identified (item 3): the container was the Slack bot server, whose whole job is to not exit. Not a Node event-loop leak. All hung executions removed; no stuck executions remain.

## 3. Start command ✅ CLOSED — root cause was config-as-code precedence
Took three attempts. Recorded in full because the failure mode is invisible from the service settings UI.

**Attempt 1 (wrong):** assumed the service had no start command and inherited `railway.json`'s. Set one on the service. Showed correctly in the API, changed nothing at runtime.

**Attempt 2 (wrong):** added per-service `railway.sync.json` / `railway.report.json` and pointed each service's Config-as-code path at its file (PR #3). Still ran the bot server.

**Actual cause:** `railway.json` at the repo root is config-as-code and applies to **every** service built from this repo, overriding service-level settings. Its `deploy.startCommand` was `node apps/slack/dist/index.js` — the orchestrator's bot server.

**Fix (PR #4):** the `deploy` block was removed from `railway.json` entirely. The `build` block is genuinely shared and stays. Deploy settings now live on each service:

- `@platform/orchestrator` → `node apps/slack/dist/index.js`, healthcheck `/health`, ON_FAILURE. Set on the service **before** the root file was stripped, so it did not lose them.
- `nightly-sync` → `node packages/integrations/dist/sync.js`, no healthcheck
- `weekly-report` → `node apps/slack/dist/report.js`, no healthcheck

The two per-service files from attempt 2 were deleted as ineffective.

⚠ **Deploy-order trap, hit once:** deleting a config file while a service's Config-as-code path still points at it fails the deploy at Initialization with `service config at '<file>' not found`. A failed deployment offers only View logs / Remove in the dashboard — there is **no redeploy**, and no API call can give a service a fresh build. Recovery was a commit to `milestone-2` to trigger a new build. Reset the path setting *before* merging any commit that removes the file.

⚠ **Standing rule:** any new service (including `apps/api` and `apps/dash` at integration Step 4) must set its own start command on the service. Nothing repo-wide supplies one any more.

## 4. `weekly-report` config ✅ CLOSED (verified live Sept 9 2026)
Cron schedule `0 16 * * 1` was already correct — the earlier "next in 14 hours" reading was a misread.

Fault one: `node apps/slack/dist/report.js` had been entered as the service's **buildCommand**, not its startCommand, so the service never built the repo and then started the bot server via the root config. Build command corrected; start command now set on the service.

Fault two: the service had **zero** environment variables. `report.ts` throws immediately without `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID`. Added 8 as Railway reference variables pointing at `nightly-sync` (`${{nightly-sync.NAME}}`) so there is one copy of each secret: the 3 Slack, 2 Supabase, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `LLM_ALLOW_BROWSER`. It deliberately does NOT get the TikTok, YouTube or Stripe keys — it only reads aggregates out of Supabase.

Verified by a manual run that posted successfully to Slack.

## 5. Verification run ✅ CLOSED (Sept 9 2026, 16:59 UTC)
Manual trigger produced a clean end-to-end run:

```
[sync] sync starting — platforms: tiktok, youtube, stripe
[sync] tiktok: rotated refresh token persisted to tokens table
[sync] tiktok: 155 videos, 2860 followers
[sync] youtube: 66 videos, 340 subscribers
[sync] stripe: 907 checkout sessions
──────── sync summary ──────── content 221 · performance 221 · enrollment 907
```

SQL check passed: `select provider, updated_at from tokens;` → one `tiktok` row at `2026-09-09 16:59:11+00`, matching the log line. Execution settled as **succeeded**.

⚠ Timing correction: this list previously said ~2 min. The real run took **~3.5 minutes** (16:59:10 start, 17:02:28 summary). Don't treat 2 minutes as a hang threshold.

⚠ Redeploying a cron service does NOT execute it — it only rebuilds and stages the image. Runs come from Cron Runs → Run now, or the schedule.

## 6. LLM cap ✅ CLOSED (Sept 9 2026)
`LLM_MONTHLY_CAP=2000000` set on **both** `nightly-sync` and `weekly-report`. This list previously said "the main service", which the code contradicts:

- `weekly-report` only *reads* the var, to render the cap line in the Slack report (`report.ts` — "(no cap set)" was the visible symptom).
- `nightly-sync` is the service that actually spends tokens, so it is where a cap can refuse a run.
- `@platform/orchestrator` is not involved.

### Related finding: `LLM_ALLOW_BROWSER` should not be on Railway
`packages/shared/src/llm.ts` documents `LLM_ALLOW_BROWSER=1` as a StackBlitz/WebContainers-only escape hatch that must never be set on real hosting. It was nonetheless present on `nightly-sync`. Set to `0` on both services (the code tests `=== '1'`, so `0` is inert). Still to do: **delete it outright** from both services in the dashboard — the MCP integration can set variables but not remove them.

## 7. Step 14 — verification runbook ⏳ ONLY REMAINING ITEM
Definition-of-done is **2 consecutive successful scheduled nightly syncs** (07:00 UTC). The Sept 9 manual run does not count toward this. Earliest close: Sept 11 2026.

When both have passed: write the M5 close-out here and flip the cron line in `02-built-status.md`.

## 8. Minor open notes
- Node version: `.nvmrc` says 20, and local work should use `nvm use 20` (the sibling portal repo needs 22). ⚠ Railway's builder does **not** honour `.nvmrc` — the Sept 9 build image used **Node 24.10.0**. The workspace compiles fine on it, but the runtime version is not what the repo declares.
- Build warning worth watching: pnpm reports `Ignored build scripts: esbuild`. Harmless for the tsc-built services; likely relevant when `apps/dash` is deployed at Step 4.
- Delete `LLM_ALLOW_BROWSER` from both cron services (see item 6).
- pnpm lockfile v9 quirk — was a StackBlitz artifact, now moot post-local-migration.
- Railway service renames pending.
- KPI-1 July 2026 spike (33 enrollments) uninvestigated.
- Railway project is `perfect-truth` (`5949c098-7ce0-469f-a4c2-4c1b5125d6e3`), environment `production` (`a181f965-896e-4d6a-99b3-431d69091241`); services `nightly-sync` (`382b7c6f-f8e9-4c0e-bd26-b45df63a05b5`), `weekly-report` (`7845773d-af1f-49bc-b3fd-d873a1ec4b5e`), `@platform/orchestrator` (`23f1a5fa-7d4c-48e3-bc6a-1e5d990aebbf`).
- Analyst Supabase project is `analyst-platform` (`kmgltqfwtyhswqxjicab`) — distinct from the portal's `jtzazvkshizmuhezuxwl`. Both are reachable from the same Supabase connector.

**Sequencing note:** finish this punch list BEFORE `portal-integration.md`'s Step 4 (deploying `apps/api` + `apps/dash` to Railway) — same repo, same Railway project, and a healthy cron proves the deploy pattern the dash will reuse.
