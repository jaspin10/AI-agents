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

Implementation and verification details are completed below as each feature is verified.
