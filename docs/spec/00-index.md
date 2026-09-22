# AI Marketing & Sales Analyst Platform — Spec Index

Status: separate, working project. The analyst pipeline, suggestions agent, Slack delivery and hosted dashboard are built. Forward work is organised as the **X-series** — one plan covering marketing and sales.

**How to use:** read whichever file below covers the task, not the whole directory. CLAUDE.md at the repo root has standing code rules. Working branch is `milestone-2`, not `main` (main is an older skeleton).

## Files
- `marketing-brain.md` — connected marketing workspaces, current-code audit, contextual guides, evidence-aware video diagnosis, exact X14 journeys, agent handoffs, limitations and verification. Implemented on a review branch; not deployed.
- `x-series.md` — **the plan.** X0 access → X1 content analysis input → X2 derived metrics → X3 KPIs → X4 TikTok Business API → X5 ad analytics → X6 agent correlation → X7 sales → X8 hardening → X9 Instagram. Plus Track B, the non-code blockers. Read this first for anything forward-looking.
- `portal-integration.md` — the locked "link, don't merge" decision and the auth design X0 implements
- `01-architecture.md` — what the platform is, stack, repo structure, deployment
- `02-built-status.md` — what was built in M1–M5. **History, not a plan** — its "open items" lists are superseded by `x-series.md`
- `punch-list.md` — M5's punch list. Closed 2026-09-09; kept for the debugging history
- `working-style.md` — quirks specific to this repo (jsh, heredocs, generics, packages/shared)
- `guardian.md` — Portal Guardian: the reliability/self-repair agent for the student portal (DETECT/GROUP/TRIGGER lives in the portal repo; the investigation/repair agent, verifier and Robot Student are planned here) — **spec only, no code yet.** A separate domain from the X-series (marketing/sales) — not X- or Y-numbered.

## Sibling project
The portal repo (`jaspin10/french-with-jas-portal`) has its own `docs/spec/` — a completely separate app/DB/stack. Don't cross-reference code between them; the real links are the dashboard tab (see `portal-integration.md`) and, now, Portal Guardian (see `guardian.md`).

## How updates work
When something changes here, edit the ONE file it belongs to. Never re-paste a spec blob into chat.
