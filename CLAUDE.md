# AI Marketing & Sales Analyst Platform — Rules for Claude Code

Separate project from the French With Jas portal. Different repo, different stack, different Supabase project — never conflate them, never merge the repos (see `docs/spec/portal-integration.md`).

## Environment
- Node **20** (`.nvmrc`), NOT 22 — the sibling portal repo needs 22, don't mix up `nvm use` between the two. Note: Railway's builder does not honour `.nvmrc` and builds on Node 24.
- Working branch is **`milestone-2`**. `main` is an older skeleton (only `apps/orchestrator`) — don't build against it.
- pnpm monorepo with workspaces. TypeScript strict (unlike the portal, which is deliberately no-TS).
- Hosting: Railway. `apps/api` + `apps/dash` are not yet deployed there — only the Slack bot is live. See `docs/spec/punch-list.md` before touching Railway settings.

## Railway config — read before changing any service
`railway.json` is **config-as-code** and applies to every service built from this repo, overriding what is set on individual services in the dashboard. Its `deploy` block is therefore deliberately **empty**: a repo-wide start command was silently applied to the cron services, making them run the Slack bot server instead of their own entrypoint, which is why nightly-sync executions hung for hours.

- Start commands, healthchecks and restart policies live **on each service**, not here.
- `@platform/orchestrator` → `node apps/slack/dist/index.js`, healthcheck `/health`
- `nightly-sync` → `node packages/integrations/dist/sync.js`, no healthcheck
- `weekly-report` → `node apps/slack/dist/report.js`, no healthcheck
- A service's Config-as-code path must point at a file that exists — pointing it at a deleted file fails the deploy at Initialization, and a failed deploy cannot be redeployed from the dashboard.
- New services (including `apps/api` and `apps/dash`) need their own start command set on the service.

## Code rules
- Never heredocs in jsh. Never multi-line generics — paste single-line.
- Rebuild `packages/shared` before dependent packages when its exports change.
- Commit + push after every confirmed "done" — an M2→M5 code-loss incident here made this a hard rule.
- `performance.content_id` holds platform-native video ids, not content UUIDs — all joins go through `content.platformVideoId`.
- No publish tool exists anywhere in this codebase — hard guardrail, the agent never publishes content directly.
- `agent_logs` gets a row for every orchestrator call; unauthorized tool calls are rejected at the router level, not just logged.
- Two unskippable in-code LLM checks (banned topics + brand voice) gate every suggestion before it surfaces, rejected candidates persisted too.
- Hard `LLM_MONTHLY_CAP` guard on the agent — don't remove or bypass it. Configured on Railway (`2000000`) as of 2026-09-09.
- Cron entrypoints must call `process.exit()` explicitly — setting `process.exitCode` does not force Node to exit.

## Database
Own dedicated Supabase project, strictly separate from the portal's. Switch to the `sb_secret_` key at hosting (legacy `eyJ` JWT was a StackBlitz-only workaround) — check `docs/spec/02-built-status.md` for current status.

## Git / deploy discipline
Commit to a branch, open a PR, same as the portal repo. Base PRs against `milestone-2`, not `main`.

## Before touching sync/cron/Railway
Read `docs/spec/punch-list.md` first — M5 is not fully closed.

## Full spec
Complete spec lives in `docs/spec/` — start at `docs/spec/00-index.md`. Read only what a task needs. When something changes, edit the one matching file — never re-paste a spec blob into chat.
