# Working Style & Repo-Specific Quirks

Use the portal's working rhythm here too: one confirmed step at a time · full file rewrites over partial patches · one design question at a time until decisions lock, then code · spec updates land in the ONE matching file in `docs/spec/`, never re-pasted as a blob.

## Analyst-repo-specific quirks (apply regardless of editing environment)
- Never heredocs in jsh.
- Never multi-line generics — paste single-line.
- Rebuild `packages/shared` before dependent packages when its exports change.
- Commit + push after every confirmed "done" — an M2→M5 code-loss incident in this repo made this a hard rule.
- Node version: **20**, not 22 (`.nvmrc` says 20; the sibling portal repo needs 22 — don't mix these up when switching between repos with `nvm use`).
- Working branch is `milestone-2`. `main` is an older skeleton with only `apps/orchestrator` — don't accidentally target it.
