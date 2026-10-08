# Portal Guardian — reasoning/orchestration engine

**Not part of the X-series.** The X-series (`docs/spec/x-series.md`) is explicitly "one plan
covering marketing and sales" for the analyst/dashboard product — Guardian is a different
domain (portal reliability/self-repair) with a different owner (the portal, not Eknoor/Harman)
and different risk profile (it can propose code changes to a live app with 161+ students and
real Stripe payments). It gets its own file rather than an X or Y number borrowed from an
unrelated plan. Y-series (portal repo) is likewise unrelated (LiveKit meeting classes).

**Status 2026-10-08: investigation agent, repair agent, auto-merge, Approve gating, 2h auto-revert
watch, AI budget meter and WhatsApp + Inbox notices are BUILT (`apps/slack/src/guardian`, see
"Built 2026-10-08" below). Unit-tested and simulated end to end with fakes; NOT yet run against a
real incident.** Still not built: verifier re-running tests/build before merge, Robot Student,
WhatsApp screenshot intake. DETECT/GROUP/TRIGGER and the Error Inbox live on the portal side
(`french-with-jas-portal` `docs/spec/guardian.md`).

**2026-10-02: auto-repair rules locked by Jas** (section "Auto-repair rules" below). They
replace the earlier "nothing auto-deploys at any risk level" rule. **2026-10-08:** the "big"
list and the auto-revert window/threshold were decided (same section). Built 2026-10-08.

## Why this lives here, not in the portal repo

The build brief is explicit: "Do NOT put the Guardian reasoning/orchestration engine inside the
portal simply because errors originate there." This repo already has the pattern Guardian needs
— `apps/orchestrator` (router enforcing per-agent `allowedTools`), `agent_logs` (full audit
trail), `LLM_MONTHLY_CAP` (hard budget guard), the two-unskippable-check pattern from the
analyst agent (banned topics + brand voice — Guardian's equivalent is prompt-injection
isolation, see below). Reusing this instead of inventing a second agent framework inside the
no-TS portal repo is the point.

## Cross-project access — ✅ BUILT 2026-09-21 (portal side), ✅ secret set 2026-10-08

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

**Secret status 2026-10-08:** `GUARDIAN_SHARED_SECRET` is set on the portal function (Jas did it
in the Supabase dashboard) and the identical value is set as a Railway variable (see "Setup
status" below). Verified from the portal side: a call with a deliberately wrong secret returns
`401 unauthorized`, not `503 not_configured`. A call with the real secret has not been made yet.
The value is never written in the repo, specs or PRs.

## Setup status — 2026-10-08 (checklist Part 1, done by Jas)

Configuration done by Jas (the code that uses it is described in the next section).

- **Railway:** project `perfect-truth`, service `@platform/orchestrator` (chosen because
  Guardian wires into the existing orchestrator). Jas pasted three variables himself:
  `GUARDIAN_ANTHROPIC_API_KEY`, `GUARDIAN_SHARED_SECRET`, `GITHUB_TOKEN`. The existing
  `ANTHROPIC_API_KEY` on that service belongs to the analyst agents and is left untouched —
  **Guardian code must read `GUARDIAN_ANTHROPIC_API_KEY`**, so the CA$25/month cap only counts
  Guardian's own spend. Never set these through the Railway MCP.
- **GitHub token:** fine-grained personal access token `guardian-repair`, repository access
  limited to `jaspin10/french-with-jas-portal`, permissions Contents RW, Pull requests RW,
  Metadata R. **Expires 2027-10-07 — renew before then.**
- **WhatsApp notice template:** `portal_notice`, English, WABA `2039209266746314`. Meta refused
  to accept it as Utility (it kept warning the template would be rejected), so it was submitted
  as **Marketing** on 2026-10-08. Body: "French With Jas system notice for your staff account:
  {{1}}. Reply here if you have questions." Sample for {{1}}: "a small fix for the homework
  page was published". **Approval is pending** — check its status in WhatsApp Manager before
  building notices that depend on it.
- **Still open from the checklist:** Ramandeep's "hi" test of the WhatsApp bot (Harman's "hi"
  was confirmed as intent `greeting`).

## Built 2026-10-08 (Part 2) — `apps/slack/src/guardian`

**Where it runs:** inside the `@platform/orchestrator` Railway service (the Slack bot process,
`apps/slack/src/index.ts` calls `startGuardianLoop`), because its three variables live there. It
starts only when `GUARDIAN_SHARED_SECRET`, `GUARDIAN_ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are all
set, never throws into the host, ticks every 5 min (`GUARDIAN_INTERVAL_MIN`), and makes no AI call
unless a `TRIGGERED` incident or an approved/merged repair exists.

**Switch — `GUARDIAN_MODE` (Railway variable):** `off` | `investigate` (DEFAULT) | `auto`.
`investigate` diagnoses and writes findings to the Error Inbox but changes no code. `auto` applies
the full locked rules. Jas flips it to `auto` himself; nothing does it automatically.

**Two agent contracts so the ROUTER enforces the mode:** `guardian-investigator` (allowedTools:
`guardian.portal`, `guardian.github_read`) and `guardian-repairer` (adds `guardian.github_write`).
Every tool call is checked and logged in `agent_logs`. `guardian.github_write` refuses any file
write that is not on a Guardian branch, and refuses moving/deleting refs.

**Pipeline per tick** (`workflow.ts`): (1) merge repairs Jas approved; (2) watch merged repairs
(`revert.ts`, locked 2h rule) and auto-revert via a revert PR — refused, with a "please undo by
hand" notice, if anyone changed the same files since the fix; (3) investigate up to 1 TRIGGERED
incident: seven answers → `write_investigation`; in `auto` mode a second call proposes exact
search/replace edits (only on files it read, under `src/`, `api/`, `supabase/functions/`),
`classify.ts` decides small / big / blocked, then branch → PR → squash-merge (small) or PR + Approve
(big). Blocked = never a PR, Jas is told in the Inbox.

**Classifier** (`classify.ts`, unit-tested): Jas's 2026-10-08 list by path and changed text, erring
towards big. Hard wall (blocked): anything `whatsapp`, `whatsapp_people`/`whatsapp_messages`,
package/lock/vercel/railway/vite config, `.github/`, `.env`, `CLAUDE.md`, Guardian's own files.
**Added by Claude, more careful than the locked list (Jas may remove):** more than 3 files or ~60
changed lines is big; critical-severity incidents are big.

**AI budget:** metered in the PORTAL database (`guardian_ai_calls`, reserve before / settle after,
CA$ cents per Vancouver month, `GUARDIAN_MONTHLY_CAP_CAD` default 25, `GUARDIAN_USD_TO_CAD` default
1.4), because the analyst Supabase's `reserve_llm_call` counts all agents together. Uses
`GUARDIAN_ANTHROPIC_API_KEY` only; model `GUARDIAN_MODEL` default `claude-sonnet-4-6`. At the cap,
incidents go back to `TRIGGERED` and wait.

**Prompt-injection isolation** (`untrusted.ts`, unit-tested): every incident field, occurrence,
timeline entry, commit message and file content is wrapped in a per-call random-id
`<untrusted-data>` fence; fence-looking text inside is neutralised; the system prompt says it is
data only. Output is schema-validated (zod) and edits may only target files Guardian read.

**Portal side it uses** (portal `docs/spec/guardian.md`): `guardian-incidents` actions
`ai_reserve/ai_settle/ai_release`, `repair_create/repair_update/repair_list`, `error_counts`,
`notify`; tables `guardian_repairs`, `guardian_ai_calls`; Approve/Reject via
`guardian_decide_repair()` in the Error Inbox. The function refuses a big fix created as approved
and any `approved` status set by the agent.

## Investigation agent — ✅ BUILT 2026-10-08 (see above; original design kept below)

Receives a structured incident (occurrences, sanitized messages, feature/route/operation,
fingerprint, trigger reason — fetched via `get_incident` above) and answers the seven questions
from the build brief: real defect? reproducible? root cause? responsible component? tied to a
recent change? smallest safe repair? what regression test? Investigation results are
hypotheses, written via `write_investigation`, never treated as verified until the (also
unbuilt) verifier confirms.

**Second input (locked 2026-10-02):** error screenshots Harman sends to the portal's WhatsApp
bot (`french-with-jas-portal` `docs/spec/whatsapp-bot.md`, not built) also start an
investigation. Screenshot text is untrusted input exactly like `sanitized_message` (see below).

**Prompt-injection isolation (✅ BUILT 2026-10-08 in `untrusted.ts`; screenshot text still to come):**
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

## Repair agent — ✅ BUILT 2026-10-08 except the pre-merge test/build run (see above)

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

## Auto-repair rules — 🔒 LOCKED 2026-10-02, details LOCKED 2026-10-08 (Jas), ✅ BUILT 2026-10-08 (behind `GUARDIAN_MODE=auto`)

Replaces the earlier LOW/MEDIUM/HIGH split and the v1 rule "nothing auto-merges or
auto-deploys at any risk level".

- **Repair inputs:** Guardian `TRIGGERED` incidents AND Harman's WhatsApp error screenshots.
- **Small error → auto-merge** to portal `main`. No checks, no approval.
- **Big error → PR waits for an Approve button** in the portal's owner Error Inbox. See "What
  counts as big" below.
- **Auto-revert:** see "Auto-revert rule" below.
- **Notify:** Harman and Jas on WhatsApp AND in the Error Inbox for every merge and every
  revert.
- **Budget:** CA$25/month AI cap kept (see AI cost control).

### What counts as "big" — 🔒 LOCKED 2026-10-08 (Jas)

A fix is big (waits for Jas's Approve) if it does ANY of these:

- touches login or sign-up;
- changes who can see what (roles, access status, permissions);
- touches payments (Stripe, Interac, prices);
- changes the database structure (a migration), or deletes or edits student data;
- fixes an error that stops a class or homework from working;
- **anti-fraud (new 2026-10-08):** touches licenses, access dates, free access, discounts,
  refunds, or anything else that gives someone access or money — including anything that
  would let anyone other than Jas (e.g. Harman) extend a license.

Everything else is small and merges by itself. The merge/revert notices still go out.

**Hard wall (2026-10-08):** the repair agent may NEVER change the WhatsApp bot's role and
permission rules (`whatsapp_people` roles/permissions in the portal repo). Only Jas can
approve a change like that, by hand. The bot must also never tell a staff member how to get
around its limits. The big/small classifier must treat any diff touching those rules as
"never auto-repair", not merely "big".

### Auto-revert rule — 🔒 LOCKED 2026-10-08 (Jas)

After each merge, watch for **2 hours**. Revert the merge commit if EITHER:

- the same error happens again, even once; OR
- new errors in those 2 hours are at least **double** the errors in the 2 hours before the
  merge, AND there are at least **3** new errors.

Jas and Harman get a WhatsApp and an Error Inbox notice on every revert.

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

## AI cost control — ✅ BUILT 2026-10-08 in the portal DB (see above; original plan below)

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
   above. ~~Setting `GUARDIAN_SHARED_SECRET`~~ ✅ done 2026-10-08.
2. `apps/slack/src/guardian` skeleton wired into the existing orchestrator, `allowedTools`
   scoped to read-only (incident data via the Edge Function, source code, recent commits,
   existing tests) — no write tools until the repair agent is explicitly scoped and approved.
3. Prompt-injection isolation on incident text, tested with an adversarial sample message before
   any real incident is fed through it.
4. Investigation agent producing the seven answers, stored via `write_investigation`.
5. Robot Student harness (disabled by default) before the repair agent, so there's a safe
   verification path ready when repairs start landing.
6. Repair agent opening PRs; big/small classification using the "big" list decided 2026-10-08.
7. Auto-merge (small), Approve button wiring (big, portal side), auto-revert watch (2h rule
   decided 2026-10-08), WhatsApp + Inbox notices (needs the portal WhatsApp bot and the
   approved `portal_notice` template).
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
   attempts. (2026-10-08: the wrong-secret path was also exercised live and returned 401.)
6. Big-error repairs cannot merge without Approve: **N/A** — the rule changed 2026-10-02 (was
   "high-risk repairs cannot automatically deploy"); no repair agent exists yet to test against.
7. Monitoring continues when AI budget is exhausted: **N/A** — no AI budget exists yet to
   exhaust; detection was built AI-free from the start.
8. AI is not continuously running when there are no qualifying incidents: **PASS by
   construction** — zero AI calls exist in this build. Nothing to poll continuously.

Built 2026-10-08 but not yet exercised on a real incident: investigation, repair, auto-merge,
Approve gating, auto-revert, AI meter, notices. Still incomplete: verifier (tests/build before
merge), Robot Student (including its harness), WhatsApp screenshot intake, wiring the report
helper into the six speech/recording modules on the portal side, load/concurrency testing.
