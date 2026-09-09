# AI Marketing & Sales Analyst Platform — Spec Index

Status: separate, working project. M1–M5 substantially complete (M5 NOT fully closed — see punch-list.md). NOT yet linked to the portal (integration is a separate, later effort — Option A "link, don't merge", never a repo merge).

**How to use:** read whichever file below covers the task, not the whole directory. CLAUDE.md at the repo root has standing code rules. Working branch is `milestone-2`, not `main` (main is an older skeleton).

## Files
- `01-architecture.md` — what the platform is, stack, repo structure, deployment
- `02-built-status.md` — what's ✅ built, what's ⚠ open inside the analyst project itself
- `punch-list.md` — M5's remaining Step 13/14 punch list — READ FIRST before touching sync/cron/Railway
- `portal-integration.md` — the locked "link, don't merge" integration plan with the portal repo
- `working-style.md` — quirks specific to this repo (jsh, heredocs, generics, packages/shared)

## Sibling project
The portal repo (`jaspin10/french-with-jas-portal`) has its own `docs/spec/` — that's a completely separate app/DB/stack. Don't cross-reference code between them; the only real link is the planned dashboard-tab integration (see `portal-integration.md`).

## How updates work
When something changes here, edit the ONE file it belongs to. Never re-paste a spec blob into chat.
