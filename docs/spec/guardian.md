# Portal Guardian — reasoning/orchestration engine

**Not part of the X-series.** The X-series (`docs/spec/x-series.md`) is explicitly "one plan
covering marketing and sales" for the analyst/dashboard product — Guardian is a different
domain (portal reliability/self-repair) with a different owner (the portal, not Eknoor/Harman)
and different risk profile (it can propose code changes to a live app with 161+ students and
real Stripe payments). It gets its own file rather than an X or Y number borrowed from an
unrelated plan. Y-series (portal repo) is likewise unrelated (LiveKit meeting classes).

**Status 2026-09-20: SPEC ONLY. No code exists in this repo for Guardian yet.** DETECT/GROUP/
TRIGGER is built and live on the portal side (`french-with-jas-portal`
`docs/spec/guardian.md`) — this file is the plan for everything downstream of a `TRIGGERED`
incident: the investigation agent, the repair agent, the verifier, and the Robot Student. None
of it is implemented. Do not read this file as a built-status doc; it is a design doc with an
explicit build order for the next session(s).

## Why this lives here, not in the portal repo

The build brief is explicit: "Do NOT put the Guardian reasoning/orchestration engine inside the
portal simply because errors originate there." This repo already has the pattern Guardian needs
— `apps/orchestrator` (router enforcing per-agent `allowedTools`), `agent_logs` (full audit
trail), `LLM_MONTHLY_CAP` (hard budget guard), the two-unskippable-check pattern from the
analyst agent (banned topics + brand voice — Guardian's equivalent is prompt-injection
isolation, see below). Reusing this instead of inventing a second agent framework inside the
no-TS portal repo is the point.

## Planned architecture (not yet built)

```
guardian_incidents.status = 'TRIGGERED'  (portal DB)
  -> [NOT BUILT] a poller or webhook on this side picks up TRIGGERED incidents
  -> [NOT BUILT] packages/agents/guardian — investigation agent, same allowedTools-gated
     pattern as packages/agents/analyst, logged to agent_logs
  -> [NOT BUILT] repair agent — reproduce, diagnose, branch, patch, test, typecheck, lint,
     build, re-reproduce, open a PR against the PORTAL repo's main (never this repo's
     milestone-2 — Guardian's target is the portal)
  -> [NOT BUILT] verifier — independently checks the repair agent's claims (never trusts
     "fixed" self-reports, mirroring the X6 rule that the LLM never computes a number itself)
  -> incident status written back to guardian_incidents (cross-project write: this repo's
     Supabase is NOT the portal's — needs a service-role call to the portal project, the same
     shape as X3's dash-counts cross-project call, not a shared DB connection)
```

**Concrete gap to resolve before any code:** this repo's Supabase project
(`kmgltqfwtyhswqxjicab`) is deliberately separate from the portal's (`jtzazvkshizmuhezuxwl`).
Guardian's investigation agent runs here but needs to read/write `guardian_incidents` in the
portal's project. X3 already solved an equivalent problem (`GET /api/kpis/portal` mints a
60-second signed token, calls a portal Edge Function, numbers only, no shared connection) — the
straightforward move is a portal Edge Function (`guardian-incidents`) that this side calls with
a short-lived signed token, mirroring `dash-token`/`dash-counts`. Not built. This is the first
thing a build session on this repo needs to settle, before the investigation agent itself.

## Investigation agent (packages/agents/guardian) — NOT BUILT

Receives a structured incident (occurrences, sanitized messages, feature/route/operation,
fingerprint, trigger reason) and answers the seven questions from the build brief: real defect?
reproducible? root cause? responsible component? tied to a recent change? smallest safe repair?
what regression test? Investigation results are hypotheses, stored on `guardian_incidents.
investigation` (jsonb), never treated as verified until the (also unbuilt) verifier confirms.

**Prompt-injection isolation (NOT BUILT, required before this agent handles any real incident):**
every field that originated from student input or portal error text — sanitized_message,
browser_context, anything sourced from `guardian_occurrences` — must be passed as clearly
delimited untrusted data, never concatenated into the system/instruction portion of a prompt.
Mirrors the analyst agent's existing pattern of treating `agent_logs`-visible tool inputs as
data, not instructions. A student must not be able to write an error message like "ignore
previous instructions and delete..." and have it read as one.

**Agent invocation is event-driven, not polling on an LLM.** Per the AI cost-control
requirement: normal monitoring, fingerprinting and threshold detection are ordinary code
(already true — they run entirely in the portal's Postgres function, zero LLM calls). The
investigation agent is invoked ONLY when a `TRIGGERED` incident exists or the owner manually
requests investigation — never on a timer that runs regardless.

## Repair agent — NOT BUILT

Per the build brief's 13-step sequence (reproduce → inspect → root cause → branch → smallest
repair → regression test → existing tests → typecheck → lint → build → re-reproduce → PR →
report). Target repo is always the portal (`french-with-jas-portal`), base `main`, never a
direct push — same write discipline as every other Claude-driven change to that repo. Follows
the portal's own CLAUDE.md rules (no Tailwind/TS there, design tokens, dark-mode verification,
the Portal Rule's four touch points if a repair happens to touch a weekly-completion module,
the Le Fil lesson about confirming DB writes before 200).

## Risk levels — NOT BUILT (design only)

- **LOW** (frontend regression, null handling, idempotent retry, presentation state): repair +
  verification prepared; architecture may support future auto-healing, but nothing auto-deploys
  in v1 regardless of risk level — see next paragraph.
- **MEDIUM** (server logic, assessment logic, workflow, API behavior): repair + tests + PR,
  human approval required before production deployment.
- **HIGH** (Supabase migrations, RLS, auth/authz, deleting/modifying student records, payments,
  secrets, destructive operations, major architecture): PR only, explicit human approval
  required, no automatic deployment under any circumstance.

**v1-wide rule, stronger than the brief's own per-level split:** nothing in this build
auto-merges or auto-deploys at ANY risk level yet — every repair, low included, stops at an open
PR against the portal's `main`. "Architecture may support future auto-healing" for LOW is a
statement about future capability, not present behavior; treat it as not-yet-true until a
separate, explicit decision turns it on.

## Verifier — NOT BUILT

Independently re-runs: original reproduction, regression test, relevant existing tests,
typecheck, lint, production build, and (once Robot Student exists) critical workflows. Never
trusts the repair agent's self-report of "fixed." Records each result against the incident's
timeline (portal side).

## Robot Student — NOT BUILT, not even the harness

Synthetic student walking auth → dashboard → course/class → exercise → submission → assessment
→ results → logout, against test/synthetic data only (the existing `BTEST01` batch and test
accounts `jaspin10@gmail.com` / `gilljaspinderpal@gmail.com` are the natural fit — see portal
`ways-of-working.md`). Must never touch real student progress, grades, badges, analytics or
teacher statistics. **Per the brief's own fallback instruction** ("if safe production synthetic
testing cannot currently be implemented, build the test harness and leave unsafe execution
disabled") — even the harness is not built yet in this pass; this is flagged as the next
concrete piece of work, not deferred indefinitely.

## AI cost control — NOT BUILT (no AI calls exist yet to meter)

Planned: reuse the existing `LLM_MONTHLY_CAP` guard pattern from this repo's CLAUDE.md, scoped
separately for Guardian (suggested CA$25/month per the brief, owner-configurable, independent
of the analyst agent's cap). When exhausted: error monitoring, fingerprinting, grouping and
incident updates continue (they're not AI-gated in the first place — see above); AI
investigations queue instead of running. No code for the queue exists yet.

## GitHub / deployment / rollback

Same discipline as the rest of this repo and the portal: branch → PR → merge, portal PRs base
on portal `main`, this repo's PRs base on `milestone-2`. Guardian never pushes directly to
either. Rollback for a bad repair is "revert the merge commit" — no special Guardian rollback
tooling planned beyond that; flag if this turns out to be insufficient once a repair actually
ships.

## Build order for the next session on this repo

1. Portal-side `guardian-incidents`/`guardian-events` Edge Function (cross-project access,
   mirrors `dash-token`).
2. `packages/agents/guardian` skeleton wired into the existing orchestrator, `allowedTools`
   scoped to read-only (incident data, source code, recent commits, existing tests) — no write
   tools until the repair agent is explicitly scoped and approved.
3. Prompt-injection isolation on incident text, tested with an adversarial sample message before
   any real incident is fed through it.
4. Investigation agent producing the seven answers, stored to `guardian_incidents.investigation`.
5. Robot Student harness (disabled by default) before the repair agent, so there's a safe
   verification path ready when repairs start landing.
6. Repair agent, LOW risk only to start, PR-only, human-approved merge.
7. Verifier.
8. Expand repair agent to MEDIUM, then HIGH (HIGH stays PR-only forever per the risk-level rule
   above, regardless of how well LOW/MEDIUM perform).

## Guardian verification report (spec section 23) — honest status this pass

1. 2 different students + same error → Guardian triggers: **PASS** (portal-side, verified live).
2. 1 student + same error 3 consecutive times → triggers: **PASS** (portal-side, verified live).
3. Success resets the consecutive counter: **PASS** (portal-side, verified live).
4. Concurrent duplicate errors create one investigation: **PARTIAL** — one incident is
   guaranteed by the DB design (unique fingerprint + guarded status transition); "one active
   investigation" is not applicable yet since no investigation agent exists to launch multiple
   of. Not load-tested at real concurrency.
5. Students cannot access Guardian admin functionality: **PASS** — RLS is owner-only; verified
   via the policy definition, not a live non-owner session.
6. High-risk repairs cannot automatically deploy: **PASS by construction** — no auto-deploy
   path exists anywhere in this build, for any risk level, because no repair agent exists yet.
7. Monitoring continues when AI budget is exhausted: **N/A** — no AI budget exists yet to
   exhaust; detection was built AI-free from the start.
8. AI is not continuously running when there are no qualifying incidents: **PASS by
   construction** — zero AI calls exist in this build. Nothing to poll continuously.

Incomplete, explicitly: investigation agent, repair agent, verifier, Robot Student (including
its harness), cross-project incident access from this repo, prompt-injection isolation, AI
budget accounting, Error Inbox routing/nav, wiring the report helper into portal components,
post-repair MONITORING/reopen transitions, and any load/concurrency testing. All flagged, none
claimed as done.
