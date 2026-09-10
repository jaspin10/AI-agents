# AI Marketing & Sales Analyst Platform — Spec Index

Status: separate, working project. The analyst pipeline, suggestions agent, Slack delivery and hosted dashboard are built. Forward work is organised as the **X-series** — one plan covering marketing and sales.

**How to use:** read whichever file below covers the task, not the whole directory. CLAUDE.md at the repo root has standing code rules. Working branch is `milestone-2`, not `main` (main is an older skeleton).

## Files
- `x-series.md` — **the plan.** X0 access → X1 content analysis input → X2 derived metrics → X3 KPIs → X4 TikTok Business API → X5 ad analytics → X6 agent correlation → X7 sales → X8 hardening → X9 Instagram. Plus Track B, the non-code blockers. Read this first for anything forward-looking.
- `portal-integration.md` — the locked "link, don't merge" decision and the auth design X0 implements
- `01-architecture.md` — what the platform is, stack, repo structure, deployment
- `02-built-status.md` — what was built in M1–M5. **History, not a plan** — its "open items" lists are superseded by `x-series.md`
- `punch-list.md` — M5's punch list. Closed 2026-09-09; kept for the debugging history
- `working-style.md` — quirks specific to this repo (jsh, heredocs, generics, packages/shared)

## Sibling project
The portal repo (`jaspin10/french-with-jas-portal`) has its own `docs/spec/` — a completely separate app/DB/stack. Don't cross-reference code between them; the only real link is the dashboard tab (see `portal-integration.md`).

## How updates work
When something changes here, edit the ONE file it belongs to. Never re-paste a spec blob into chat.
