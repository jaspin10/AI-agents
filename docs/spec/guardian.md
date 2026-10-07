# Portal Guardian — reasoning/orchestration engine

**Not part of the X-series.** The X-series (`docs/spec/x-series.md`) is explicitly "one plan
covering marketing and sales" for the analyst/dashboard product — Guardian is a different
domain (portal reliability/self-repair) with a different owner (the portal, not Eknoor/Harman)
and different risk profile (it can propose code changes to a live app with 161+ students and
real Stripe payments). It gets its own file rather than an X or Y number borrowed from an
unrelated plan. Y-series (portal repo) is likewise unrelated (LiveKit meeting classes).

**Status 2026-09-21: SPEC ONLY. No code exists in this repo for Guardian yet.** DETECT/GROUP/
TRIGGER, the Error Inbox, and (new) the cross-project access point are all built and live on
the portal side (`french-with-jas-portal` `docs/spec/guardian.md`) — this file is the plan for
everything downstream of a `TRIGGERED` incident: the investigation agent, the repair agent, the
verifier, and the Robot Student. None of it is implemented in this repo yet. Do not read this
file as a built-status doc; it is a design doc with an explicit build order below.

**2026-10-02: auto-repair rules locked by Jas** (section "Auto-repair rules" below). They
replace the earlier "nothing auto-deploys at any risk level" rule. Not built.

## Why this lives here, not in the portal repo

The build brief is explicit: "Do NOT put the Guardian reasoning/orchestration engine inside the
portal simply because errors originate there." This repo already has the pattern Guardian needs
— `apps/orchestrator` (router enforcing per-agent `allowedTools`), `agent_logs` (full audit
trail), `LLM_MONTHLY_CAP` (hard budget guard), the two-unskippable-check pattern from the
analyst agent (banned topics + brand voice — Guardian's equivalent is prompt-injection
isolation, see below). Reusing this instead of inventing a second agent framework inside the
no-TS portal repo is the point.

## Cross-project access — ✅ BUILT 2026-09-21 (portal side), ⚠ needs a secret before use

The gap flagged below as "resolve before any code" is now closed. The portal deployed
`supabase/functions/guardian-incidents/index.ts` (`Verify JWT OFF` — it authenticates via a
shared secret in the `x-guardian-secret` header, the same pattern as the portal's existing
`x-sync-secret` crons, not a per-user JWT handoff — there's no human session on this side).

**Call it like this** (once this repo has any code that needs to):
```
POST https://jtzazvkshizmuhezuxwl.supabase.co/functions/v1/guardian-incidents
Headers: x-guardian-secret: <GUARDIAN_SHARED_SECRET>, content-type: application/json
Body: { "action": "list_incidents", "statuses": ["TRIGGERED"], "limit": 25 }
     | { "action": "get_incident", "incident_id": "<uuid>" }
     | { "action": "write_investigation", "incident_id": "<uuid>", "investigation": {...}, "new_status": "DIAGNOSED", "summary": "..." }
     | { "action": "update_status", "incident_id": "<uuid>", "status": "REPAIRING", "detail": "..." }
```
`get_incident` returns the incident row, its last 50 occurrences, and the full timeline in one
call. `write_investigation` is where the seven-question findings (below) get stored — it writes
`guardian_incidents.investigation` (jsonb) and, optionally, moves status forward in the same
call. `update_status` covers every other lifecycle move and always appends a timeline event —
never rewrites existing ones. Scope is deliberately narrow: only the four `guardian_*` tables,
no arbitrary SQL, no delete action, never touches student data. **This is the investigation
agent's surface, not the repair agent's** — actual code changes still only ever happen through
GitHub (branch → PR → merge on the portal's `main`, auto or Approve-gated per the auto-repair
rules below), never through this function.

**⚠ Not usable yet:** `GUARDIAN_SHARED_SECRET` has not been set (Claude cannot set Supabase Edge
Function secrets — same limitation as `DASH_URL` during X0). Generate a 24+ char value, set it
on the function in the Supabase dashboard, and use the identical value in whatever calls it from
this repo. No rush — nothing here calls it yet — but do this before starting the investigation
agent skeleton (next item), so the first real call isn't blocked on a missing secret.

## Investigation agent (packages/agents/guardian) — NOT BUILT

Receives a structured incident (occurrences, sanitized messages, feature/route/operation,
fingerprint, trigger reason — fetched via `get_incident` above) and answers the seven questions
from the build brief: real defect? reproducible? root cause? responsible component? tied to a
recent change? smallest safe repair? what regression test? Investigation results are
hypotheses, written via `write_investigation`, never treated as verified until the (also
unbuilt) verifier confirms.

**Second input (locked 2026-10-02):** error screenshots Harman sends to the portal's WhatsApp
bot (`french-with-jas-portal` `docs/spec/whatsapp-bot.md`, not built) also start an
investigation. Screenshot text is untrusted input exactly like `sanitized_message` (see below).

**Prompt-injection isolation (NOT BUILT, required before this agent handles any real incident):**
every field that originated from student input or portal error text — sanitized_message,
browser_context, anything sourced from `guardian_occurrences`, and any text read from a
WhatsApp screenshot — must be passed as clearly delimited untrusted data, never concatenated
into the system/instruction portion of a prompt. Mirrors the analyst agent's existing pattern
of treating `agent_logs`-visible tool inputs as data, not instructions. A student must not be
able to write an error message like "ignore previous instructions and delete..." and have it
read as one.

**Agent invocation is event-driven, not polling on an LLM.** Per the AI cost-control
requirement: normal monitoring, fingerprinting and threshold detection are ordinary code
(already true — they run entirely in the portal's Postgres function, zero LLM calls). The
investigation agent is invoked ONLY when a `TRIGGERED` incident exists (`list_incidents` finds
one), a WhatsApp screenshot arrives, or the owner manually requests investigation — never on a
timer that runs regardless.

## Repair agent — NOT BUILT

Per the build brief's 13-step sequence (reproduce → inspect → root cause → branch → smallest
repair → regression test → existing tests → typecheck → lint → build → re-reproduce → PR →
report). Target repo is always the portal (`french-with-jas-portal`), base `main`, never a
direct push. Whether the PR then merges on its own or waits for Jas is decided by the
auto-repair rules below. Follows the portal's own CLAUDE.md rules (no Tailwind/TS there, design
tokens, dark-mode verification, the Portal Rule's four touch points if a repair happens to touch
a weekly-completion module, the Le Fil lesson about confirming DB writes before 200 — and, now,
the pattern already used twice on the portal side: `Submissions.jsx` and `DrillBlock.jsx` both
had this exact class of bug, an unchecked/under-checked write, so a repair agent working a
"silent failure" incident should check for a missing `.error` check first).

## Auto-repair rules — 🔒 LOCKED 2026-10-02 (Jas), ❌ NOT BUILT

Replaces the earlier LOW/MEDIUM/HIGH split and the v1 rule "nothing auto-merges or
auto-deploys at any risk level".

- **Repair inputs:** Guardian `TRIGGERED` incidents AND Harman's WhatsApp error screenshots.
- **Small error → auto-merge** to portal `main`. No checks, no approval.
- **Big error → PR waits for an Approve button** in the portal's owner Error Inbox. An error is
  big if EITHER the fix touches login, access, payments or student data, OR the error itself
  blocks a class or homework.
- **Auto-revert:** if the same error or new errors rise after a merge, revert the merge commit
  automatically.
- **Notify:** Harman and Jas on WhatsApp AND in the Error Inbox for every merge and every
  revert.
- **Budget:** CA$25/month AI cap kept (see AI cost control).
- **Still undecided (Jas):** (a) the exact path/table list that makes a fix "big";
  (b) the revert window and the threshold that triggers a revert. Do not build the big/small
  classifier or the auto-revert check until both are decided.

## Verifier — NOT BUILT

Independently re-runs: original reproduction, regression test, relevant existing tests,
typecheck, lint, production build, and (once Robot Student exists) critical workflows. Never
trusts the repair agent's self-report of "fixed." Records each result against the incident's
timeline (portal side, via `update_status`). Under the 2026-10-02 rules small fixes merge
without waiting for these checks; the verifier's job for them is the post-merge watch that
drives auto-revert.

## Robot Student — NOT BUILT, not even the harness

Synthetic student walking auth → dashboard → course/class → exercise → submission → assessment
→ results → logout, against test/synthetic data only (the existing `BTEST01` batch and test
accounts `jaspin10@gmail.com` / `gilljaspinderpal@gmail.com` are the natural fit — see portal
`ways-of-working.md`). Must never touch real student progress, grades, badges, analytics or
teacher statistics. **Per the brief's own fallback instruction** ("if safe production synthetic
testing cannot currently be implemented, build the test harness and leave unsafe execution
disabled") — even the harness is not built yet; this is flagged as concrete future work, not
deferred indefinitely.

## AI cost control — NOT BUILT (no AI calls exist yet to meter)

Planned: reuse the existing `LLM_MONTHLY_CAP` guard pattern from this repo's CLAUDE.md, scoped
separately for Guardian (CA$25/month, owner-configurable, independent of the analyst agent's
cap). When exhausted: error monitoring, fingerprinting, grouping and incident updates continue
(they're not AI-gated in the first place — see above); AI investigations queue instead of
running. No code for the queue exists yet.

## GitHub / deployment / rollback

Same discipline as the rest of this repo and the portal: branch → PR → merge, portal PRs base
on portal `main`, this repo's PRs base on `milestone-2`. Guardian never pushes directly to
either. Merging is automatic for small fixes and Approve-gated for big ones (auto-repair rules
above). Rollback is "revert the merge commit", done automatically when post-merge errors rise.

## Build order for the next session on this repo

1. ~~Portal-side `guardian-incidents` Edge Function (cross-project access).~~ ✅ Done — see
   above. Setting `GUARDIAN_SHARED_SECRET` is the one remaining manual step.
2. `packages/agents/guardian` skeleton wired into the existing orchestrator, `allowedTools`
   scoped to read-only (incident data via the Edge Function, source code, recent commits,
   existing tests) — no write tools until the repair agent is explicitly scoped and approved.
3. Prompt-injection isolation on incident text, tested with an adversarial sample message before
   any real incident is fed through it.
4. Investigation agent producing the seven answers, stored via `write_investigation`.
5. Robot Student harness (disabled by default) before the repair agent, so there's a safe
   verification path ready when repairs start landing.
6. Repair agent opening PRs; big/small classification once Jas decides the "big" list.
7. Auto-merge (small), Approve button wiring (big, portal side), auto-revert watch once Jas
   decides the window/threshold, WhatsApp + Inbox notices (needs the portal WhatsApp bot).
8. WhatsApp screenshot intake as the second repair input.

## Guardian verification report (spec section 23) — honest status this pass

1. 2 different students + same error → Guardian triggers: **PASS** (portal-side, verified live).
2. 1 student + same error 3 consecutive times → triggers: **PASS** (portal-side, verified live).
3. Success resets the consecutive counter: **PASS** (portal-side, verified live).
4. Concurrent duplicate errors create one investigation: **PARTIAL** — one incident is
   guaranteed by the DB design (unique fingerprint + guarded status transition); "one active
   investigation" is not applicable yet since no investigation agent exists to launch multiple
   of. Not load-tested at real concurrency.
5. Students cannot access Guardian admin functionality: **PASS** — RLS is owner-only on the
   portal DB; the `guardian-incidents` function has no user-facing path at all (shared secret,
   not a session) — verified via the policy/code definitions, not live non-owner and non-secret
   attempts.
6. Big-error repairs cannot merge without Approve: **N/A** — the rule changed 2026-10-02 (was
   "high-risk repairs cannot automatically deploy"); no repair agent exists yet to test against.
7. Monitoring continues when AI budget is exhausted: **N/A** — no AI budget exists yet to
   exhaust; detection was built AI-free from the start.
8. AI is not continuously running when there are no qualifying incidents: **PASS by
   construction** — zero AI calls exist in this build. Nothing to poll continuously.

Incomplete, explicitly: investigation agent, repair agent, verifier, Robot Student (including
its harness), prompt-injection isolation, AI budget accounting, the 2026-10-02 auto-repair
pieces (auto-merge, Approve gating, auto-revert, WhatsApp/Inbox notices, screenshot intake),
wiring the report helper into the six speech/recording modules on the portal side,
post-repair MONITORING/reopen transitions, any load/concurrency testing, and the
`GUARDIAN_SHARED_SECRET` manual step. All flagged, none claimed as done.
