# Marketing Brain

Implementation branch: `marketing-brain/astra-overhaul`, based on `milestone-2` at `aa34a73`. This is a review branch; do not merge or deploy as part of this task.

## Current-state audit

The audit read root CLAUDE.md, the spec index, architecture/history, X0–X14 and the later proposed boundaries, punch list, working style, brand constitution, all twelve named dashboard areas, API/auth/studio routes, shared metric/correlation functions, analyst evidence/generation, orchestrator dispatch/logging, memory storage, and ingestion. Current code takes precedence over historical deployment claims. No production database or paid model was queried.

| Area | Decision | Finding and intended home |
| --- | --- | --- |
| Analysis | KEEP / IMPROVE | Essential human context, not an AI diagnosis. Rename the view Content notes within Results; preserve saves, pairing and ad entry. |
| Audience Research | IMPROVE | Buried inside Suggestions; move to Audience, retain redaction, distinct evidence counts and archive/edit rules. |
| Brief Lab | IMPROVE | Strong version/approval backend, oversized collapsed form. Give Create a Briefs view and exact-record navigation. |
| Creative Memory | KEEP / IMPROVE | Versioned observations of a video, not a database of proven marketing laws. Expose in Learnings and diagnosis; retain the editor in Content notes. |
| Idea Map | IMPROVE | Hypothesis chips obscure source/outcome provenance and production status. Give Create an Ideas view with explicit lifecycle/lineage labels. |
| Insights | MERGE / IMPROVE | Keep report generation and tag decisions in Learnings; soften causal labels and explain observational comparisons. |
| KPIs | KEEP | Owner-only business visibility, with permanent historical enrollment caveats. |
| Metrics | MERGE | Keep age snapshots, twins and ad-window detail as a Results view. |
| Performance | IMPROVE | Local formula omits saves and displays unsupported shares as zero. Reuse X2 rates; add video diagnosis and unknown states. |
| Production Board | IMPROVE | A versioned form hidden under Suggestions, not a visible board. Add stages and item drilldowns in Create; reuse every existing transition. |
| Run Log | KEEP | Owner-only engineering information; expose under System, never in shared Brain payload. |
| Suggestions | MERGE | Retain Posted/Skipped, checks and evidence; move to Create without mounting every studio form at once. |
| Navigation | REMOVE / REPLACE | Remove eight peer destinations as the primary mental model; retain old deep links as aliases. |
| Brain / guides / diagnosis | MISSING → BUILD | Add an operational home, reusable contextual guides, evidence-aware diagnoses, content journey and real record activity. |

## Architecture and boundaries

Primary workspaces: Brain → Audience → Create → Results → Learnings. Owner-only Business and System remain separate. Secondary views preserve existing capabilities. Strategy is the approved brand constitution and human goal-setting, not an invented autonomous agent. The map expresses workflow dependencies, not evidence that an agent just ran.

The learning loop is strategy → audience evidence → suggestion/hypothesis → chosen hook → versioned brief → production → owner review → externally published video → recorded performance → diagnosis → stored patterns/manual creative memory → next proposed test.

New aggregation and lineage reads are authenticated, read-only and use the analyst project's existing data. No new tables, migration, automatic publishing, audiovisual processing, external service, vendor or paid generation are needed. Exact confirmed lineage comes only from X14 records and their referenced brief revisions; X6 matches stay inferred and X1 twins stay a separate relationship.

## Rejected and deferred scope

- Decorative particle networks, fake agents/live activity, numerical confidence percentages and invented retention curves are rejected.
- X6 engagement scoring and X2 availability heuristics remain locked under C4. New comparisons are explicitly labelled observational and do not rewrite X6 reports.
- Formal preregistered experiments and human-promoted/retired learning rules remain X16/X18 follow-ups. Existing reports and versioned manual notes are the durable evidence layer.
- Automated media work remains blocked by C3; no asset is fetched or processed.
- Additional reviewer roles, sales attribution, TikTok Business access and Facebook missing view metrics require their existing separate decisions.

## Final information architecture

The default `/analytics` experience is now Brain. Existing named URLs continue to open their corresponding tools. Client navigation preserves browser Back/Forward, normal anchor modifier-clicks and exact-item query parameters. Owner-only deep links redirect marketing users to Brain; the API independently enforces permissions.

| Before | After | Question / next action |
| --- | --- | --- |
| Analysis | Results → Content notes (`analysis`) | What did a human observe? Describe a video, then inspect its outcome. |
| Metrics | Results → Metrics & twins (`metrics`) | What do the original snapshots, age windows, twins and ad-time split say? |
| Performance | Results → Videos & diagnosis (`performance`) | What happened, how comparable is it, and what should we test? |
| Suggestions | Create → Suggestions (`suggestions`) | Which checked idea should a human select? Start its exact brief. |
| Idea Map | Create → Ideas & hypotheses (`idea-map`) | Which evidence and production records belong to this idea? |
| Brief Lab inside Suggestions | Create → Briefs (`briefs`) | Which hook, script, references and revision require review? |
| Production Board inside Suggestions | Create → Production (`production`) | Where is each reviewed handoff, and what blocks it? |
| Audience Research inside Suggestions | Audience (`audience`) | Which real questions should inform a lesson? |
| Creative Memory inside Analysis | Learnings → Creative memory (`learnings`); editor remains in Content notes | What was recorded and reviewed, with which asset/version? |
| Insights | Learnings → Pattern reports (`insights`) | Which stored X6 patterns and proposed tags need review? |
| KPIs | Business (`kpis`), owner only | What enrollment visibility exists, including its incomplete Stripe denominator? |
| Run Log | System (`run-log`), owner only | What actually happened in orchestrator calls? |

Nothing in X0–X14 was removed as a capability. Removed UI: eight unrelated primary destinations, the three eager-mounted studio forms inside Suggestions, the duplicated Performance rate calculation and the old suggestion-only chip map. Strategy remains human direction constrained by the existing brand constitution, represented in the map and brief inputs.

## Brain map and attention model

Six semantic stages form a directed learning loop: Strategy → Audience → Creative → Production → Results → Learnings → Strategy. Native React, CSS and SVG provide the map; no graph library, particle simulation or continuous animation was added. `BRAIN_CONNECTIONS` supplies one tested cycle, and `BrainMap` uses real counts plus stage-specific inputs, outputs and an Open action. A connection means a workflow handoff, not proof that two individual records share lineage.

Home includes saved-state counts, the newest available snapshot date, attention tasks, recent above/below-baseline videos, a stored pattern preview, seven production-stage totals, surfaced ideas and six recent creative/report records. Agent cards describe three existing processes only. A manual insight-run flag is shown only when the API reports it; there is no inferred cron/agent heartbeat.

`brainAttention` computes these priorities without writing state:

1. Production blockers, opening that exact production item.
2. Export review/open revision requests, opening that exact item.
3. Overdue unfinished production; posted/reviewed items do not become overdue alerts.
4. Briefs with passed draft checks but no approval of the current version.
5. Up to eight below-baseline videos, each opening its diagnosis.
6. Pending hypothesis proposals, focusing the tag-review section.
7. Missing human video context, opening Content notes filtered to unanalysed videos.

The home shows six attention items initially; the remaining recorded tasks are disclosed in an expandable list. It is a review queue, not a scheduler. Unavailable sources are named and their counts are null/“—”; counts describe the loaded records and never imply that every source succeeded.

## Reusable guides

`guides.ts` is a typed registry for all 13 views. Every guide has: purpose, inputs, outputs, source, AI role, limits, human approval, good outcome, failure modes and next action. `Guide.tsx` renders the registry in a native modal dialog with labelled heading, close controls and backdrop. Native dialog provides modal focus containment, Escape and focus return; those browser interactions remain a manual QA gate in this environment.

Guides cover Brain, Audience, Suggestions, Ideas, Briefs, Production, Videos/diagnosis, Content notes, Metrics/twins, Creative memory, Pattern reports, Business KPIs and Run log. Long explanations stay in the guide; evidence and material limitations stay beside the relevant decision.

## Performance diagnosis and comparison rules

The new diagnosis is deterministic display logic in `brain-diagnosis.ts`; it neither calls an LLM nor changes a stored X6 report. It is deliberately stricter than the original general platform report. The two scopes are labelled separately.

1. **What happened:** show the latest raw recorded counters, X2 rates, capture date, snapshot count and native provenance. A metric explicitly marked missing/error/unsupported is displayed as unavailable. Raw snapshots remain intact. Legacy fields stay labelled unverified.
2. **What the data supports:** prefer an exact calendar-day 30 snapshot, then day 7, then day 1, where a qualifying peer cohort exists. The displayed latest totals and the historical comparison observation are distinct.
3. **Possible causes:** only a recorded human opening/CTA can ground a creative hypothesis. The text explicitly says that the result does not isolate its effect. No generated retention curve, “bad hook” verdict or invented causal confidence exists.
4. **What we do not know:** explain missing early retention/completion/replay, uncontrolled audience/context/fatigue, incomplete ad context and absent video-to-sales attribution.
5. **What to try next:** suggest one change while preserving the lesson and comparison conditions. A link opens a new brief prefilled with the source video and proposal. This does not create a formal experiment or generate/pay for anything.

Comparability rules:

- Join snapshots only on `content_uuid` and the content's platform. Orphans, native-ID collisions and mismatched platforms do not join. This tested helper also replaces the old fallback joins in the API's X2 path and analyst's X6 input shaping.
- Use the existing X2 percent calculation, including available saves, and its locked platform share-availability heuristic. Explicitly unavailable native fields cannot support a new diagnosis. X2's underlying function and the X6 correlation math are unchanged.
- Same platform, normalized exact format, tri-state ad status, exact recorded calendar-day age and compatible provenance signatures. A native definition cannot silently mix with a different definition or an unverified legacy definition.
- Known durations must be within 20%; unknown duration matches only unknown duration, with a visible limitation. All current creative-memory records are paged for this decision, so an older omitted record cannot masquerade as an unknown duration.
- At least 100 views on the target and each scored peer. At least **eight other videos**, excluding the target. Eight is a reporting floor, not statistical confidence.
- Compare against the peers' median engagement. The existing ±20% relative convention determines above/below; other qualifying results are near baseline. A zero median, insufficient peers, missing format or missing exact-age snapshots causes abstention.
- Approximate X2 history remains available in Metrics but does not substitute for an exact observation in this diagnosis. Calendar day is not elapsed 24 hours. Peers may be historical; no recent-period causal promise is made.
- Snapshot age greater than two calendar days is visibly stale. This is a freshness notice, not an automatic sync or an outcome adjustment.

The overview excludes peer citation rows; the selected video's read-only endpoint returns up to 60 deterministic peer references, while the median and sample size always use the full qualifying cohort. The UI discloses truncation. This bounds payload and DOM size without changing the baseline.

## Evidence and confidence model

| Label | Meaning | Does not mean |
| --- | --- | --- |
| Observed record | A stored measurement, saved citation or human note | Independently verified truth or causation |
| Supported pattern | A validated stored X6 claim with at least eight distinct evidence videos and its reported sample | An experiment or statistical confidence estimate |
| Hypothesis | A proposed explanation/change grounded in recorded creative input | A diagnosis of the true cause |
| Unknown | Missing measurements, missing context or a source that cannot answer | Zero, failure or proof of no relationship |
| Confirmed | An X14 human declaration of exact export and historical brief revision | Machine verification of asset contents |
| Inferred | X6 historical automatic matching by hypothesis/format and timing | Confirmed production lineage |

Stored claims must pass schema checks: finite metrics, required sample floor, distinct evidence IDs matching `n`, and possible ad counts. Invalid claims are omitted with a source warning. Numerical confidence percentages were intentionally not introduced. Stored standing cautions are preserved, and pair views add the audience/timing/distribution/metric-definition confounders.

## Success analysis and creative memory

Above-baseline and below-baseline results use the same evidence rules and drilldown. An above-baseline video leads to repeat-and-verify guidance; one result never becomes a universal rule. A lower result leads to a single-variable proposal, and insufficient evidence leads to collect-context/wait guidance.

Learnings brings together the existing durable evidence stores: immutable insight reports and versioned manual creative memory. Pattern cards show platform, dimension, direction, group/platform medians, sample size, ad exposure counts, report ID/date, contributing video links and next-use guidance. Reports older than seven days get a staleness notice. Matching a video's tag alone never makes it contributing evidence.

Memory cards show saved revision, topic/video, reviewed versus draft observations, asset version and updated date. The original editor and revision history remain in Content notes. Its asset-change invalidation, manual timestamps and review controls remain unchanged. Only reviewed annotations enter the existing brief-generation evidence path.

Contradicting experiments, promoted rules, rule retirement and a true experiment register are **not recorded yet**. The view says so. Idea lifecycle is an overlay over existing suggestion/brief/production/X14 states; it can show untested, brief in progress, in production, confirmed publication, inferred outcome, skipped or rejected. Hypothesis evidence can show supported association, weak/no material difference, contrary or mixed patterns by platform. These are not automatic formal tested/supported/contradicted experiment states.

## Content journey and historical integrity

`GET /analytics/api/brain/journey/:id` first verifies that the content UUID exists, then reads its X14 links and each exact `brief_id`/`brief_version`. Its historical audience IDs, selected hook, learning outcome and originating suggestion are returned as a narrow projection. A missing historical revision stays unknown. Current brief edits never supply historical facts.

Overview lineage also resolves the original brief revision to identify the originating suggestion. Otherwise a later edit of `suggestionId` could move a published result to a different idea. Historical reads run in batches of ten. Failed context reads are labelled; no relationship is manufactured.

The visible chain is idea/hypothesis → exact teaching brief → production/export review → published video → contributing stored patterns. The Content notes and Metrics links expose analysis and performance; the Learnings link closes the loop. X6 inferred outcomes appear separately. X1 cross-platform twins remain in Metrics and are not promoted to lineage. Direct audience links can retrieve older entries beyond the summary's 500-record limit. Brief links explicitly open the current editor, while historical context is shown in the journey itself.

## Future-agent interface

`BrainAgentDefinition` describes identity, purpose, inputs, outputs, allowed actions, human approval, upstream departments and downstream consumers. Home uses it for the existing Suggestion analyst, Pattern analyst and Brief drafting workflow. It describes capability, not execution state. Recent work comes only from stored records and the existing manual insight flag/job history.

A future Hook, Script, Performance, Diagnosis or Repurposing agent can declare this metadata, attach a real action to a department, produce the existing versioned/evidence-linked outputs, and supply honest execution status. Its runtime implementation still needs registration in the existing orchestrator/authorization/budget/logging path. No new agent or permission is implied by adding a UI card. The new UI does not grant tool access or bypass review.

## Data and operational limitations

- There may be no qualifying baseline in a real account. Exact-day peers, known context and compatible definitions are deliberately required.
- Legacy/native definitions, zero-share availability, missing Facebook view data and tri-state ad exposure retain the existing limitations. Unknown exposure is not organic-only evidence.
- Calendar-day history is not precise elapsed-age sampling. Old peers may not reflect the current audience or platform.
- Average watch time cannot establish an opening drop, retention curve, completion or replay behavior.
- Hook, CTA and format hypotheses do not isolate audience fit, pacing, fatigue, packaging or posting-context causes.
- Confirmed asset identities are human declarations. No audiovisual fetch, transcription, rendering or verification occurs.
- Research, briefs, production and recent lineage summaries cover the latest 500 records per source. Direct detail routes remain available. Counts are labelled with that scope. Full current memory, content, analysis, performance and suggestion reads are paged beyond PostgREST's default 1,000-row boundary.
- Pagination is a live read, not a transactional database snapshot. Concurrent edits/syncs can change a later refresh. The workspace read time does not promise live ingestion.
- Pattern cards use the latest stored X6 report; they do not compare report versions or enumerate contradicting experiments.
- No video-to-enrollment/revenue attribution, generic persona generation or new business/reviewer roles were introduced.
- The new home/API have not been exercised against production credentials or real account volume during this run.

## Performance, security and accessibility review

All major views are lazy loaded. Concurrent identical GETs deduplicate; the Brain snapshot has a 30-second session-memory cache that invalidates after successful writes, including a write that completes during an in-flight read. No background polling, model call or media request is added. Results/ideas/patterns use bounded initial lists; activity is six records, and diagnosis citations cap at 60.

Browser-safe shared exports keep the LLM SDK, credentials and Node budget code out of the client bundle. Initial JavaScript is 176.57 kB / 57.92 kB gzip versus baseline 230.30 kB / 69.67 kB gzip; lazy chunks load on demand. CSS is 37.20 kB / 9.12 kB gzip. These are Vite production-build sizes, not live-network measurements.

A local synthetic 1,000-video single-cohort benchmark took about 391 ms for the pure overview diagnosis calculation; its JSON was 1,931,891 bytes, down from 8,105,891 bytes with all peer citations. This excludes database/network latency and is not a production SLA. Very large histories may still warrant incremental/server-side projections; no destructive retention policy was added.

New read routes require owner/marketing before storage access. Invalid/foreign UUIDs do not expose records; failures expose generic errors and named source categories. Brain responses omit generation payloads, prompts, token costs, owner revenue and agent logs. Existing X0 cookies, owner-only KPIs/logs, cross-site write defenses, request/version conflicts, brief/export approval, banned-topic/brand gates, `LLM_MONTHLY_CAP`, reservations and orchestrator logging remain intact. No tables, migrations, RLS, Railway service settings, scheduled jobs or vendor configuration changed.

The UI uses semantic links/buttons, labelled controls, native disclosure/dialog elements, visible focus, a skip link, text alongside status colors, scrollable table/board regions and reduced-motion rules. New fine-print labels use at least 12px. The mobile map becomes a two-column ordered stage grid, removes connector lines and puts attention first; the production board scrolls within its own region. These are implemented behaviors requiring the visual/manual confirmation below.

## Verification — 2026-09-22

Runtime: Node **20.20.2**, pnpm **10.15.0**, frozen existing lockfile. No dependency was added. Commands: `pnpm build`, `pnpm test`, `pnpm typecheck`, `git diff --check`. No existing lint script/configuration is defined.

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Shared | 44 | 0 |
| Memory pagination | 3 | 0 |
| Analyst | 7 | 0 |
| API | 17 | 0 |
| Root guide/map contracts + existing PGlite migration regressions | 7 | 0 |
| **Total** | **78** | **0** |

Baseline: 49 passing tests. Added: 29 focused cases. Existing tests were retained; the brief-workflow fixture implements the new read-only memory-store method. New checks cover classification, exact cohort boundaries, zero/unknown/native-unavailable metrics, duration, age selection, canonical joins, deterministic duplicate captures, bounded/full cohort equivalence, actionable targets, lineage labels and historical edits, role rejection before I/O, generic errors, missing sources, no mutation path, guide coverage, map cycle, agent handoff validity and pagination failures.

All eight workspace builds and dashboard TypeScript pass. Three extra preview smoke scenarios pass: populated owner, empty marketing, partial source failure. They check API projections, built static assets, detail/journey reads and 405 responses for fixture writes; they are **not browser rendering tests**.

**Visual QA is blocked, not passed.** The available cloud browser rejected `http://127.0.0.1:5173/analytics/` (`ERR_BLOCKED_BY_CLIENT`) and then rejected the documented shared-file preview path because its URL policy permits only HTTP/HTTPS. No alternate browser/control mechanism or deployment was used to bypass that policy. No actual viewport, screenshot, keyboard dialog or visual contrast result is claimed.

| Required viewport | Intended behavior | Actual browser verification |
| --- | --- | --- |
| 1440px | Map plus attention; workstation layouts | Blocked |
| 1280px | Compact workstation spacing | Blocked |
| 1024px | Stacked map/attention and narrower sections | Blocked |
| 768px tablet | Top navigation, fewer columns | Blocked |
| 390px / 320px mobile | Attention first; two-column stage map; local table/board scrolling | Blocked |

### Local review harness

After `pnpm build`, run `node tests/preview-brain.mjs` and open `http://127.0.0.1:5173`. The wrapper offers 1440, 1280, 1024, 768, 390 and 320px frames around the actual built dashboard. The page is visibly marked **SYNTHETIC FIXTURE**. It uses the real Brain/Studio read routers and deterministic calculations against local fake records, binds only to loopback, rejects all writes, and never imports the production server or connects to a database/model. No fixture record can enter production.

Optional modes: `--marketing`, `--empty`, `--partial`; `--check` runs the nonvisual smoke assertions and exits. Owner-only business integrations are deliberately unavailable in this fixture. Use an authorized real session for the existing business/owner checks when the change is eventually approved for a staging/live environment.

### Remaining manual gate (maximum ten checks)

1. Check Brain/map/attention at all six listed widths for overflow, readable labels and clear hierarchy.
2. Use Tab, Enter and Escape on the guide; confirm focus containment and return, visible focus and reduced-motion behavior.
3. Open a blocker, brief-review task and a video from attention; confirm the exact record opens and Back/Forward returns correctly.
4. Compare above, below, near-baseline, insufficient, stale and no-snapshot diagnoses; inspect native availability and peer evidence.
5. Open a confirmed journey after editing its current brief; confirm the displayed historical hook/idea remain unchanged and inferred links stay separate.
6. Follow an idea to Briefs and a diagnosis to its next-test brief; confirm evidence selection, save/version conflict, checks and human approvals using authorized real/test records.
7. Inspect the seven production stages, blockers, export review, immutable asset versions and owner-only confirmed-posted control.
8. Inspect Creative Memory, draft/reviewed annotations, report staleness and contributing-video links; verify existing save/history behavior.
9. Check empty, partial-failure and expired-session states; confirm retry/refresh recovers without fake zero counts.
10. Use a marketing session to verify Business/System are absent and direct API access remains denied; owner session retains the original KPI/log behavior.

## Delivery and genuine follow-ups

Dedicated review branch: `marketing-brain/astra-overhaul`; PR base: `milestone-2`. The complete verified source is saved in GitHub. No merge, deployment, paid model call or production-data mutation is part of this work.

The remaining gate for this PR is actual browser/live-session QA, explicitly blocked above. Future product work remains the existing formal experiment register and promoted/contradicted/retired playbook model; precise retention and sales attribution require real source capabilities and separate decisions. The current implementation does not claim those future features exist.

## Analytics handoff follow-up — 2026-09-22

Live owner handoffs were accepted by Railway at 22:24 UTC, but the following
`/analytics/` request served the portal HTML. A public diagnostic reproduced
that response with `X-Vercel-Cache: HIT`; `/analytics/brain` reached Railway
and enforced session authentication. Successful handoffs now redirect directly
to `/analytics/brain`, avoiding the ambiguous cached launcher URL. Session
signing, single-use tokens, cookie settings and role gates are unchanged.
Authenticated browser verification remains required after deployment.

Validation: API TypeScript build passed. A local signed handoff verified the
Brain redirect, no-store header, scoped httpOnly cookie, authenticated API
access and single-use replay rejection. No production credentials were used.

## Brief-generation diagnostics — 2026-09-22

A reported `studio_unavailable` during hook generation exposed two confirmed
code defects: all thrown generation failures were flattened to an opaque 503,
and completed hooks with failed/stale checks disappeared from the interface.
Existing runtime logs did not identify the particular underlying provider,
budget or output failure in the screenshot; do not claim that cause is known.

Generation failures now return an allowlisted explanation and request ID,
distinguishing configuration, budget authorization, accounting, missing brand
rules, provider access/rate limits, timeouts and invalid generated output.
Server diagnostics contain only stage, request ID and safe code, never raw
provider responses or user text. Cleanup failure no longer masks the initial
generation error. Storage failures retain their existing behavior.

The Brief Lab refreshes job status after a failed generation without replacing
unsaved form edits. Unapproved hook candidates remain visible for inspection,
with failed checks and reasons; selection remains blocked until every required
check passes. Saving edits still resets review. No automatic paid retry, budget
increase, approval bypass, migration or production-data edit is introduced.

The particular live generation failure needs a subsequent attempt with the
new diagnostics before its underlying service cause can be confirmed.
