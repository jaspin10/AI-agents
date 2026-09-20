# The X-series — one plan for marketing + sales

Status as of 2026-09-10. **This is the single plan.** Everything previously scattered across `content-analysis.md`, the M4.5 "open items from 4.5" list, and the M6/M7 placeholders is consolidated here, ordered by what has to happen first.

Milestones are prefixed X to keep them apart from the historical M-series (M1–M5 describe what was already built; they are history, not a plan).

**Renumbering note:** the 2026-09-09 draft numbered content analysis as X1. Auth turned out to block it, so auth became X0 and the rest shifted. Old X1→new X1 (unchanged), old X2→X2, old X3→X4, old X4→X5, old X5→X6, old X6→X9.

**Track B renamed 2026-09-11:** Track B items are now `X-B1`..`X-B5` (was `B1`..`B4`), so they never collide with the portal's Y-B# items. Open decisions live as `D#` in the decisions list.

**Decisions D16–D20 answered 2026-09-12** — see X7, X-B1, X-B2, X-B4, X-B5 below.

**X-V closed 2026-09-12** — X1's save path, X6's nightly chain and manual run, and the X-B4 key switch are all verified live. See the X-V block at the end of Track A.

---

## Where things actually stand

Built and live: the analyst pipeline (TikTok + YouTube + Stripe sync, nightly at 07:00 UTC), the suggestions agent with its two unskippable safety checks, Slack delivery, and the hosted dashboard at `analyst-dash-production.up.railway.app`.

X0, X1, X2, X3, X6 and X-V are done — see below. Not built: X4, X5, X7–X9.

**X0 shipped 2026-09-10.** Nobody needs a password for this dashboard anymore; access is entirely through the portal.

---

## Environment variables — the service parity rule (learned in X-V, 2026-09-12)

**Any Railway service that spawns the insights entrypoint needs the same env vars as `nightly-sync`, or it degrades silently instead of failing.** This bit twice in one session:

- `ANTHROPIC_API_KEY` missing on `analyst-dash` → the manual "Run insights now" button produced a **numbers-only** report (real counts, no narrative, no tag proposals) with an amber badge. Nothing errored; the fallback is by design. Fixed by copying the key across, along with `LLM_MONTHLY_CAP` and `LLM_ALLOW_BROWSER` so manual runs sit inside the same spend cap.
- `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID` missing on `analyst-dash` → `WARN [insights] Slack env vars unset — summary not posted`. Nightly runs post to Slack, manual runs do not. **Left unset deliberately as of 2026-09-12** — copy both across if manual runs should post too.

The general rule: when a service gains the ability to run an agent, audit its variables against the service that already runs it. A missing key here never throws; it quietly produces a thinner answer.

Same applies to `SUPABASE_SERVICE_ROLE_KEY` — it lives on `analyst-dash`, `nightly-sync` and `weekly-report`. All three were switched together in X-B4; missing one would have failed on its own cron, days later, not at switch time.

---

## Track A — code, in order

### X0 — Access: portal Google login → dash
**Why first:** Eknoor cannot be given the dashboard at all until this exists. Every other milestone is work she can't reach. Also removes a static password currently guarding revenue data on a public URL.

**Status 2026-09-10: SHIPPED AND VERIFIED END TO END.** Portal PR #11 and analyst PR #19 merged. `dash-token` deployed and configured. Owner click-through confirmed live (`handoff ok: owner learn@frenchwithjas.ca` in the Railway deploy log, matching a `200` from `dash-token`). `DASH_PASSWORD`/`DASH_USER` retired and the `/auth/basic` transition route removed in a follow-up PR. The portal is now the *only* door, permanently — not just by policy but because no other door exists in the code anymore.

**⚠ Correction, 2026-09-12 (found during X-V):** the code-side removal is real, but **`DASH_PASSWORD` and `DASH_USER` are still present as variables on the Railway `analyst-dash` service.** Nothing reads them — they are dead credentials, not an open door — but the claim above that they were "unset on Railway" was wrong. **Handed to portal milestone M9 (security hardening): delete them, or this line stays a known inaccuracy.** Not X-V's to fix.

- Portal repo: Supabase Edge Function `dash-token` checks the caller's real portal session, reads `profiles.role`, and mints a short-lived signed token. This runs beside the portal's three existing Edge Functions (`smart-handler`, `sync-recordings`, `sync-enrollments`), deployed with `supabase functions deploy <n>`.
- Portal repo: `src/pages/Analytics.jsx` calls that function, then opens the returned handoff URL in a new tab.
- Analyst repo: `apps/api` verifies the token signature against a shared secret, reads the role claim, and gates every route by role.
- Shared signing secret `DASH_TOKEN_SECRET` (32+ chars, identical) lives in both Railway `analyst-dash` and the portal's Edge Function secrets.
- **Locked:** no standalone dash login, no direct Railway URL access ever. Portal is the only door.
- Design detail in `portal-integration.md`'s Auth section.

**Sub-decisions locked 2026-09-10 (Jas):**
- Handoff token: 60 seconds, single use (`jti` burned on first use), HS256, claims `iss=fwj-portal aud=analyst-dash typ=handoff sub email role jti iat exp`. Only `owner` and `marketing` are ever minted one — every other role is refused by the Edge Function with `no_access` before anything is signed.
- `apps/api` exchanges it at `GET /auth/handoff?token=…` for its own httpOnly `dash_session` cookie (**12 hours**, SameSite=Lax, Secure on Railway). Nobody is re-verified per click; when the cookie dies you click Analytics in the portal again.
- Dash URL opened with no token and no cookie → **302 straight to the portal login** (`PORTAL_URL`, default `https://portal.frenchwithjas.ca/analytics`). No message, no login form. `/api/*` without a session answers `401` JSON; the dash reloads `/` on 401 and the server bounces it.
- Local dev: `DASH_DEV_ROLE=owner|marketing` in `.env` stands in for the cookie. Ignored whenever `RAILWAY_ENVIRONMENT` is set — it cannot become a production door.
- The old `API_WRITE_TOKEN` / `VITE_API_WRITE_TOKEN` bearer on the suggestion-status write is gone; that route is session + role (owner, marketing).
- New `GET /api/me` → `{ role, email }` so the dash draws only the panels the caller can open.
- The interim HTTP Basic fallback (`/auth/basic`, `DASH_USER`/`DASH_PASSWORD`) that bridged the switchover has been removed entirely from the code. There is no code path left that checks a password — see the variable-cleanup correction above.

**Route → role (enforced in `apps/api`, mirrored in `apps/dash/App.tsx`):**
- owner, marketing: `/api/me`, `/api/suggestions`, `POST /api/suggestions/:id/status`, `/api/content-performance`, `/api/analysis/*` (X1), `/api/metrics` (X2), `/api/insights/*` (X6), `/api/kpis/coverage` (X3 — no dollars, no enrollments)
- owner only: `/api/kpis`, `/api/kpis/monthly`, `/api/kpis/portal` (X3), `/api/logs`

**Role permissions (locked, mechanism-independent):**
- `owner` — everything.
- `marketing` — Analysis, Suggestions, Idea map, Performance, Metrics. **No revenue anywhere.** No Run log.
- `salesman` — nothing on this dash yet. **Changes at X7: per D16 the sales side becomes a slice of THIS dash, so `salesman` gains its own panel set there.**

**Verification record (2026-09-10):**
- `dash-token` invocation log: two `503 not_configured` at 14:22 UTC (secrets not yet saved on the Supabase side), then `200` at 14:29 UTC once saved.
- `apps/api` deploy log at that same moment: `handoff ok: owner learn@frenchwithjas.ca`.
- Marketing-role behaviour verified pre-ship by direct API test: a minted `marketing` token got `403` on `/api/kpis`, `/api/kpis/monthly`, `/api/logs`, and `200` on `/api/suggestions`, `/api/me`, `/api/content-performance`. Eknoor's own live click-through was confirmed the same evening (`handoff ok: marketing www.eknooor919@gmail.com`, 18:15 UTC).

### X1 — Eknoor inputs content analysis
**Confirmed 2026-09-10:** Supabase MCP has full read/write access to the analyst project (`kmgltqfwtyhswqxjicab`), verified with a live `execute_sql` call — not just the portal project. Not a blocker for X1.

**Status 2026-09-12: SHIPPED AND VERIFIED IN LIVE USE.** The save path works end to end and Eknoor is using it unaided — three analyses saved on 2026-09-12 (`analysis saved: tiktok 7563820434509122837 / 7563024913053781268 / 7562082886585748747 by www.eknooor919@gmail.com`, 15:21 / 15:24 / 16:10 UTC), plus owner saves the same afternoon. Coverage moved from 50 analysed at X6's start to **104 of 222 by 17:09 UTC on 2026-09-12**, so this is steady real use, not a one-off test.

**The save-500 bug and its sequel, both fixed 2026-09-10 — worth keeping because the second one is the instructive half:**
1. **DB side (PR #32, migration 0010).** Migration 0001's `content_hypothesis_check` constraint (`hypothesis in ('H1','H2','H3')`) survived the X1 taxonomy replacement, so every `PUT /api/analysis/:contentId` failed with `violates check constraint "content_hypothesis_check"`. Dropped.
2. **Client side (PRs #33, #34).** Dropping the DB constraint immediately exposed a second copy of the same stale enum: `HypothesisTagSchema` in `packages/shared` still validated `H1|H2|H3`, so the moment a real X1 tag landed in the table, **every read** — `GET /api/analysis`, `/api/metrics`, `/api/content-performance`, and the read inside the save itself — threw a ZodError and 500'd. Confirmed from deploy logs 20:58–21:06 UTC. PR #33 fixed the schema and broke the build (`.options` does not exist on `ZodString`); PR #34 inlined the three literals and unbroke it.

**Lesson, recorded so it is not relearned:** a taxonomy lives in more than one place. When a CHECK constraint is dropped, grep for every schema, enum and validator that encoded the same values — the database is usually the *last* copy, not the only one.

**Why second:** it is the only milestone that produces genuinely new information rather than rearranging what exists. X6 cannot learn anything without it, and it takes human time to fill, so starting it early means the data is ready when the agent is.

**X1 is also the replacement for the old hypothesis-taxonomy effort** (dropped 2026-09-10, see Track B history). `content.hypothesis` gets populated from Eknoor's structured descriptions rather than from a separate hand-built taxonomy — so the mapping onto `content.hook` / `.format` / `.hypothesis` below is not a nice-to-have, it is now the only path by which those columns ever get filled. Treat it as required scope, not an optional extra.

Built:
- `content_analysis` table (RLS on, service_role only) · `GET /api/analysis` · `GET /api/analysis/ref/:platformVideoId` · `PUT /api/analysis/:contentId` (upsert; validates every ref is real, not self, different platform; canonicalises `idea_source`; writes `content.hook/.format/.hypothesis` every save) · `Analysis` panel first in the dash nav for owner + marketing.
- `content.hypothesis` is a mechanical tag from the structured fields — `<format-slug>[+model][+cta:<type-slug>]`, e.g. `talking-head+model+cta:comment`. X6 proposes richer tags from the free-text description.
- **PR #24 (styling):** dark fields, purple focus ring, custom select chevron, pill chips, styled checkbox, primary/ghost buttons.
- **PR #26, migration 0006:** `content_analysis_refs` join table — a video can pair with more than one twin at once, written in both directions on save. `ad_boosted` became tri-state (`true`/`false`/`null` "don't know"), independent per video.
- **PR #28, migration 0007:** `content_ad_runs` child table — a video can be re-boosted more than once, each run with its own dates and spend. Per-run only, no auto-summed total; a combined figure is computed at report time in X5.
- **PR #29, migration 0008:** YouTube Shorts as a distinct `content.platform` value (`youtube_shorts`), classified by `contentDetails.duration` ≤60s — imperfect but the best signal the Data API offers. Existing rows relabel in place on the next nightly sync via `content.reclassifyPlatform`, no duplicate rows, no FK breakage.

Scope rules that still bind:
- New table `content_analysis`, one row per content row: description, hook_text, format, has_model, has_cta, cta_type, ad_boosted (tri-state), idea_source, analysed_by, analysed_at. Refs and ad runs live in their own tables.
- **REQUIRED — build platform-agnostic.** Never hardcode `platform IN ('tiktok','youtube')` in the query, UI, filters or schema. The page lists whatever platforms exist in `content`. When X9 lands, Instagram rows appear with **zero changes to X1 code**.
- **`idea_source`:** who had the *idea* — not who filmed, edited or posted. Known values: AI agent, Jas, Eknoor, Loop Studio, Harman, Manjot, Other, and the list keeps growing, so it must never be a CHECK enum. Loop Studio and Manjot are idea sources only — not portal roles. Legacy videos stay NULL; there is no backfill.
- `/api/analysis/*` authenticated by the X0 session cookie via `requireRole('owner','marketing')` — never a baked-in `VITE_` token.
- **Required:** every save also writes `content.hook` / `.format` / `.hypothesis`. This is the only path that fills those columns.
- Show per-platform metrics only where present; never derive or fill a missing one.
- **Ad data is manual entry.** Eknoor has TikTok Ads Manager and Meta Ads Manager access, so this is a lookup per video, not a guess — neither platform marks a finished boost on the post itself. X4's `impression_sources` could later corroborate ad *presence* on TikTok only; it never supplies dates or spend, and says nothing about Instagram. These three fields stay manual, X4/X6 included.

**Sub-decisions locked 2026-09-10 (Jas):**
- `idea_source` — plain `text`, free text with quick-pick chips (seeded list ∪ `SELECT DISTINCT idea_source`). Server trims and case-insensitively matches on save, so "jas" / "Jas " collapse onto "Jas". Lookup table rejected.
- `format` and `cta_type` — dropdowns with an `Other` free-text escape, stored as `text` with no CHECK constraint.
  - format: Talking head · Skit · Screen/text overlay · Voiceover B-roll · Duet/Stitch · Live clip · Other
  - cta_type: Comment · Follow · Link in bio · DM · Enrol/Book · Save/Share · None
- Cross-platform refs — paste the paired video's platform video ID; server validates it exists and sits on a different platform, and echoes the matched title for confirmation. Title search rejected.
- **Editable after submit.** Upsert keyed on `content_id`; `analysed_at` refreshes every save. An Analysed / Not yet badge and filter make untagged videos easy to work through.
- `analysed_by` — auto-filled from the session. No form field.

**Open, not a bug — the thing worth doing next:** as of 2026-09-12 there are still **0 cross-platform ref pairs**. Every X6 claim is therefore pooled across unrelated videos, which is the weaker kind of evidence. Pairing TikTok videos with their YouTube twins is the single highest-value thing Eknoor can do to strengthen the analysis, because it holds hook, format and idea source constant and leaves platform as the only variable.

### X2 — Derived metrics
**Why third:** pure computation over data that already exists plus X1's fields. No external dependencies, no approvals, nothing can block it.

**Status 2026-09-10: SHIPPED.** PR #31 squash-merged to `milestone-2` (commit `46bbdf3`). Migration 0009 applied to the analyst project via MCP before merge.
- Built: `packages/shared/src/metrics.ts` (pure functions, `pnpm --filter @platform/shared test`) · `GET /api/metrics` (owner + marketing) · `Metrics` panel second in the dash nav, one card per video with its 0..N twins as side-by-side columns and a "With twins only" filter.
- Shares on a platform count as reported iff any snapshot on that platform has ever recorded a non-zero share count — derived from data, no hardcoded platform list. YouTube shows share rate "n/a", not 0%.
- The ad split's label is a field on the payload (`adSplit.label`, `adSplitLabel`), not UI copy, so any renderer, export or agent carries it.

Scope, per video:
- comment rate, share rate, engagement rate (as % of views). Engagement = likes + comments + shares + saves, from the **latest** snapshot. A metric a platform never reports shows "n/a", not 0%.
- view velocity: views at day 1 / 7 / 30 after `posted_at`, from snapshot history.
- follower-normalised views: latest views ÷ `followers_at_capture` from the **earliest** snapshot on or after `posted_at`, labelled with the snapshot date used.
- cross-platform side-by-side for paired videos — one column per twin, 0..N twins via `content_analysis_refs`.
- before/after-ad view split from snapshots + X1's manual ad run dates — **a time split, not a true paid/organic split. Label it as such everywhere.**

**Sub-decisions locked 2026-09-10 (Jas):**
- **Multiple ad runs → combined split.** Views attributed by snapshot delta: each consecutive pair's gain goes to *inside* if the interval overlaps any ad run, else *outside*. Two numbers per video regardless of run count. A `NULL` end date means still open. Per-run breakdown deferred to X5.
- **Velocity with missing history → nearest earlier snapshot, flagged** (e.g. "1,240 (day 5)"). Two blanks, never a number: "too new" if younger than N days, "no snapshot" if none exists at or before day N. Never interpolate.
- **`performance.content_id` → migrated.** Migration 0009 adds `performance.content_uuid uuid REFERENCES content(id) ON DELETE CASCADE`, backfilled from `content.platform_video_id` (636/636 rows), indexed, with a `before insert or update` trigger filling nulls. Gotcha: the nightly upsert lands on the `(content_id, captured_date)` conflict path as an UPDATE, so the client must never send `content_uuid: null`; the trigger is the second guard. All X2 joins use `content_uuid`. Closes the M4.5 ambiguity.

### X3 — KPI view, rebuilt
**Why here:** the old KPI tab was erased 2026-09-10 (it printed revenue in plain text). It needed redesigning around roles, which only exist after X0.

**Ordering with X-B2 reversed 2026-09-10 (Jas).** X-B2 no longer blocks X3 — the other way round. **X3 builds the view first, and the view is what makes X-B2 doable.**

- The view **labels the Stripe-visible figure as incomplete on its face** — not a footnote, not a tooltip.
- Month-by-month shape, because that is what makes the gap diagnosable.
- **Never present the Stripe figure as total enrollments or total revenue** anywhere — UI, Slack, agent rationales. It is "enrollments we can see".
- **D18 (2026-09-12) changes what "resolved" can mean: there is NO backfill.** Months before M7.12 ships stay permanently short; their gap bar is history, not a to-do.

**X3 shipped 2026-09-11 (PR #36).** Locked sub-decisions:
- **KPI 3 source:** `GET /api/kpis/coverage` (owner + marketing) — per posted week (Monday start, UTC): videos posted vs videos with a `content_analysis` row, per platform, against the 4/week goal. `content.hypothesis` is NOT the source — it drifts.
- **Marketing enrollment counts:** not built. KPI tab stays owner-only.
- **No stated baseline line.** The "~60/month" figure was never drawn — the portal has the real number.
- **The portal supplies the real picture.** `GET /api/kpis/portal` (owner only) mints a 60-second HS256 bearer with `DASH_TOKEN_SECRET` (`iss=analyst-dash aud=fwj-portal typ=counts`) and calls the portal's `dash-counts` Edge Function. The two Supabase projects never touch — numbers only, no names, emails or ids. Cached 5 min; `?refresh=1` bypasses. Needs `PORTAL_FUNCTIONS_URL` on Railway; until set the panel says "not connected".
- **What the portal returns, from `2026-09` onward only:** per month → per `profiles.level` → `new`, `renewed`, `bySource` (`stripe`/`manual`/`interac`/`legacy`/`unknown`), `legacy`. Month key = `plan_start`, else `start_date`.
- **Renewals:** the portal only held the CURRENT plan, so renewals were never recorded. Portal-side `plan_history` + trigger applied 2026-09-11. Months on/after the first history row are `renewalsMode: 'exact'`; earlier months `'estimated'`. Each month badged. Portal detail in `docs/spec/access-control-enrollment.md`; portal PR #13.
- **The view (`apps/dash/src/Kpis.tsx`, owner only):** three cards — "Enrollments we can see (Stripe)" with an amber incomplete badge and a gap bar (red at ≥50% missing); "Students in the portal"; "Videos analysed per week". The word "total" does not appear.

### X6 — Agent correlation + the closed loop
**Depends on X1 having real volume — roughly 50 analysed videos.**

**Status 2026-09-12: SHIPPED AND FULLY VERIFIED (X-V).** Both run paths now confirmed against live logs:
- **Chained nightly run — confirmed 2026-09-12 07:02–07:07 UTC.** `nightly-sync` pulled TikTok (156 videos, 2,859 followers), YouTube (66 videos, 340 subscribers, 26 classified as Shorts), Stripe (921 checkout sessions), wrote 222 content / 222 performance / 921 enrollment rows, then logged `insights: starting X6 agent (chained after sync)` → run `f6915354` stored ok, 45 new tag proposals of 80, 8,752 tokens in / 5,210 out → `insights: done`. The chain works exactly as specced: one child process, sync's exit code untouched.
- **Manual run — confirmed 2026-09-12 17:07–17:09 UTC.** `Run insights now` by `learn@frenchwithjas.ca` → run `f7303669` stored ok, 15 new tag proposals of 86, 9,424 tokens in / 5,468 out, logged as `insights manual run … (ok)`.
- **First real output:** 104 analysed / 98 scored / 0 pairs. TikTok (95 scored, median engagement 1.54%) produced 8 claims; the standout is `cta_type=Comment` at 1.11% against the 1.54% median (n=8, pooled) — a weak hypothesis to test, correctly labelled as such. YouTube (4 analysed, 0 scored) and YouTube Shorts (5 analysed, 3 scored) both correctly returned "not enough scored videos yet (need 8)". The caution block printed all five lines including the no-pairs warning.
- **Gotcha found during verification:** the manual button initially returned a **numbers-only** report because `ANTHROPIC_API_KEY` was set on `nightly-sync` but not on `analyst-dash`. Fixed by copying the key plus `LLM_MONTHLY_CAP` and `LLM_ALLOW_BROWSER`. Slack env vars remain unset on `analyst-dash`, so manual runs do not post to Slack — deliberate for now. See the service parity rule at the top of this file.

Built: `packages/shared/src/correlation.ts` (pure, node:test, 14 cases) · `insights` agent (`capability analysis.insights`, no tools) · `apps/orchestrator/dist/insights.js` cron entrypoint · `GET /api/insights/latest`, `/runs`, `POST /api/insights/run`, `POST /api/insights/tags/:id` · `Insights` panel third in the nav · Idea map X6 edges · Slack summary via `postSlackText`. Tables (migration 0012): `insight_runs`, `hypothesis_suggestions`.

**Sub-decisions locked 2026-09-10 (Jas):**
- **Runs nightly + manual.** Nightly is chained from `sync.ts` on the existing `nightly-sync` service — no new service, no dependency cycle, and an insights failure never changes sync's exit code. `--dry-run` and `--no-insights` skip it. Manual spawns the *same* entrypoint from `apps/api`, one at a time (409 while in flight).
- **Program counts, AI writes the words.** Every number comes from `correlation.ts`; the LLM may not introduce, round or estimate a figure. No key or cap reached → a `numbers_only` report instead of a failure (exactly what the missing-key case produced).
- **Minimum 8 scored videos per group** and per platform before a claim. Smaller groups read "not enough videos". Group median vs platform median, ±20% relative is the call-out line.
- **Both surfaces:** Insights panel and a Slack summary, generated from the same payload, always ending with the caution.
- **Tags are suggest-only.** Approve in the dash is the only path that writes `content.hypothesis`. Reject closes the proposal; a re-proposal is a no-op.
- **Score = engagement rate only.** One score, not three. Videos under 100 views are unscored.
- **Suggestion → outcome is automatic.** Candidates are videos tagged `idea_source = AI agent`, posted after the suggestion, matching its hypothesis tag or format. Every edge carries `matching: 'auto'`.
- **X-B2 flag:** `B2_ENROLLMENT_RECONCILED=1` turns off the "denominator incomplete" caution. **Per D18 there is no backfill, so it can never be honestly set for historical months** — expect that line to keep running. Setting it would first require the caution to become month-aware.

- **Required: break results down by platform, not just overall.** The same format or idea source performs differently per platform, and a pooled number hides that. This is a grouping requirement on the agent's output, not new plumbing.
- **Cross-platform ref pairs are the strongest evidence available** — same content, hook/format/idea_source constant, platform the only variable. X6 should say so explicitly when it has a pair. As of 2026-09-12 there are still zero pairs, and the agent correctly flags this in every run.
- **Standing caution:** a couple hundred videos with ad-spend confounds is enough for patterns, not proof. Outputs are hypotheses to test. Anything touching enrollments is time-correlation only. With D18, the historical enrollment denominator is permanently incomplete, so that caution is standing.

### X7 — Sales analyst / CRM agent (was M6)
**D16 ANSWERED 2026-09-12: X7 is a SLICE OF THIS DASH.** Not a separate product, not a separate repo, not dropped. It shares the analyst pipeline, the same Railway service, the same Supabase project, and the same X0 portal-login door. Harman reaches it through the portal, on the existing `salesman` role.

What that settles:
- No new repo, no new deploy target, no second auth mechanism.
- `salesman` gains its own panel set in `PANELS_BY_ROLE`, gated server-side in `apps/api` exactly like `marketing`. **Sales panels do not imply revenue access** — any dollar figure stays owner-only unless separately decided.
- The CRM idea (WhatsApp conversations + Harman's call notes) lands as data sources feeding this slice, not a standalone CRM product.

Still open for the X7 chat: what the sales agent reads (WhatsApp export shape, note format), what it outputs, and whether any of it belongs in the portal's Offers tab instead.

**Still deliberately late in the build order.** D16 settles the shape, not the timing.

### X8 — Hardening (was M7)
- Loop hardening, error handling, whatever the previous milestones surfaced.
- Deliberately vague; scope it when the earlier milestones reveal what actually breaks.

### X9 — Instagram + Facebook
**Status 2026-09-20: Instagram ingestion LIVE AND VERIFIED. Facebook content ingestion LIVE AND VERIFIED; Facebook performance snapshots remain blocked by Meta metric availability/permissions.**

Meta-side setup:
- Page `645259428673564` links to Instagram professional account `17841474051897273` (@frenchwithjas).
- Production System User token currently carries `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`.
- A read-only System User (`Backend1`) owns the production token. Meta secrets remain Railway-only.

Instagram production verification (2026-09-19):
- nightly sync completed successfully with `instagram: 91 videos/reels, 3020 followers`;
- no sync errors; Instagram rows entered the existing `content` + `performance` pipeline;
- the later X6 line `instagram=0 claims` means no Instagram insight claims were generated in that run, not that ingestion failed.

Instagram implementation:
- read-only Meta Graph client, Graph API v26.0 by default (override `META_GRAPH_API_VERSION`);
- verifies Page → Instagram linkage;
- walks video/Reel media and stores views, likes, comments, shares, saves, average watch time, follower count;
- uses `appsecret_proof`; no publishing, messaging, commenting or ad-management capability;
- does not reinterpret `reels_skip_rate` as retention.

Facebook production verification (2026-09-20):
- migration `0012_facebook_platform.sql` was applied to analyst Supabase project `kmgltqfwtyhswqxjicab`; both content/performance platform checks now allow `facebook`;
- live Railway sync found `53 videos/reels, 17 followers`;
- Facebook video discovery uses the Page access token obtained server-side from `/me/accounts`, plus Page post/attachment fallback where Graph v26 does not expose the old video edges reliably;
- all 53 Facebook items were written successfully to `content` with no platform-constraint error;
- live metric coverage was `views=0/53, engagement=16/53, avg_watch=0/53`;
- because the performance schema requires a real view count, the sync deliberately wrote 0 Facebook `performance` rows instead of fabricating zero views;
- this leaves Facebook content ingestion operational, but Facebook performance analytics incomplete until Meta exposes a usable view metric for the token/Page (likely requiring additional Page insights permission or a different supported metric).

Facebook implementation:
- `facebook` is a first-class platform in shared validation and DB constraints;
- read-only client uses the configured System User credential only to resolve a Page access token; neither token is logged or stored outside Railway;
- current Page posts are inspected for video/Reel attachments and deduplicated by native video id;
- current/legacy insight paths are tried conservatively; unavailable metrics stay null;
- no publishing, messaging, commenting or ad-management capability exists;
- missing Meta view metrics are never converted into fake 0-view performance snapshots.

Remaining before X9 is fully closed:
- obtain/verify the Meta permission/metric combination that exposes a real Facebook Page video/Reel view count (and average watch time if available);
- rerun production sync and confirm Facebook `performance` rows are written with real views;
- update this section once the Facebook performance path is live.


### X-V — X1 / X6 verification + fixes
**CLOSED 2026-09-12.** A checking milestone, not a build. All three items verified against live Railway logs:

1. **X1 save path — verified.** Migration 0010 applied and PR #32 merged 2026-09-10; the client-side sequel fixed in #33/#34 the same evening. Live saves confirmed by Eknoor (three on 2026-09-12) and by the owner. Coverage at 104/222.
2. **X6 both run paths — verified.** Chained nightly run 07:02–07:07 UTC and manual run 17:07–17:09 UTC, with run ids, token counts and tag-proposal counts recorded in the X6 block above.
3. **X-B4 key switch — done.** `SUPABASE_SERVICE_ROLE_KEY` switched to an `sb_secret_` key on `analyst-dash`, `nightly-sync` and `weekly-report`. New deployment booted clean (`API + dash on port 8080`, 17:06 UTC) and a live write succeeded on the new key (`analysis saved: youtube krJsFtnuXBs`, 17:07 UTC) — a read would not have proven it, since the service role key is what writes.

Found along the way, now recorded elsewhere in this file: the env-var service parity rule (top of file), the `DASH_PASSWORD`/`DASH_USER` correction (X0, handed to portal M9), and the zero-ref-pairs gap (X1).

---

## Track B — not code, needs a person

**X-B1 — Instagram access. RESOLVED 2026-09-12 (D17).** The contractor situation is settled — access is in hand. What is left is not a person problem: Meta has to switch the metrics on, expected around **Tue 2026-09-15**. No fallback needed; the "create a new Facebook Page and re-link Instagram" option is off the table and should not be revived.

History, kept because it explains the env var shape: the Facebook Page (645259428673564) sat in a business portfolio owned by the website contractor and was linked to the wrong IG profile. Env vars already scoped (META_APP_ID/SECRET/PAGE_ID/IG_USER_ID/ACCESS_TOKEN; System User token recommended).

**X-B2 — Enrollment reconciliation. D18 ANSWERED 2026-09-12: capture from now on, NO BACKFILL.**

Stripe shows 15–33 completed enrollments/month against a stated 60/month baseline. E-transfer and manual invoices bypass Checkout entirely, so they are invisible to every number this system produces.

- Portal milestone **M7.12** ships a manual enrollment tool. From the day it is live, every Interac / manual enrollment is recorded with `source` in `{interac, manual}` and flows into `dash-counts.bySource` with no dash change.
- **Past months are NOT backfilled.** They stay short, permanently. The X3 gap bar for those months is history, not a task.
- M7.12 therefore does **not** need the backfill screen originally scoped for it.
- `B2_ENROLLMENT_RECONCILED=1` should stay unset — it would claim a completeness that does not exist. Making it useful would require a month-aware caution first.
- **Enrollment and revenue figures before M7.12 are a floor, forever.** Say so in the day-90 review.

**X-B3 — Hypothesis taxonomy v2 — DROPPED 2026-09-10 (Jas).** Superseded by X1. Consequences:
- `content.hypothesis` stayed NULL and `hypothesis-tags.csv` header-only until X1 shipped. Nothing else would have filled them.
- The suggestions agent groups by hypothesis tag — until X1, the Idea map stayed mostly "UNTAGGED". Expected, not a bug.
- Any partly-done back-catalogue open-coding is now unused. Tell whoever did it before they spend more time.
- **Do not restart a separate taxonomy effort.** If X1 turns out not to fill this need, reopen this decision explicitly rather than quietly running both.

**X-B4 — Supabase key type. DONE 2026-09-12 (D19), inside X-V.** The Railway services authenticated with the legacy `eyJ` JWT service-role key, a leftover from the StackBlitz era. A legacy JWT carries its permissions inside the token and cannot be revoked individually; an `sb_secret_` key is an opaque identifier checked server-side, so a single key can be revoked or rotated alone.

Switched on **all three** services that read the analyst project — `analyst-dash`, `nightly-sync`, `weekly-report`. Verified by a clean boot plus a live write, not just a page load. The old key was kept during the switch as the rollback path.

**X-B5 — TikTok Business API approval. D20 ANSWERED 2026-09-12: DO NOT START YET.**

TikTok Business account + app registration + new OAuth scopes need TikTok's approval before X4 can be written. That approval is an external clock. Jas has chosen to wait rather than start the application now.

Consequence, recorded so it resurfaces instead of quietly dying: **X4 and X5 have no start date** — the clock has not begun, and waiting does not shorten it. Nothing else in the X-series is blocked. Revisit when real TikTok watch time or a true paid/organic split becomes the thing standing between you and a decision.

---

## Scope decisions (locked 2026-09-09/10, plus D16–D20 on 2026-09-12)

- Platforms live today: **TikTok, YouTube, YouTube Shorts**. Instagram/Facebook arrive at X9. **Code must never hardcode the platform list.**
- **Videos only.** Photos and carousels dropped.
- Same video on both platforms must be pairable for cross-platform comparison.
- The dash stays a separate app — Option A, "link don't merge." **D16 extends this: the sales side (X7) also lives here rather than becoming a third app.**
- Access is via portal Google login only. No standalone dash password, at all, as of X0.
- Hypothesis tagging comes from X1's structured descriptions, not a separate taxonomy exercise.
- Incomplete figures may be shown, but never unlabelled. **With D18, incompleteness before M7.12 is permanent.**
- **Any service that can run an agent needs the same env vars as the service that already runs it** — X-V, see the parity rule above.

## Data reality (verified against repo + DB; counts updated 2026-09-12)

- `content`: platform, platformVideoId, title, hook, format, hypothesis, postedAt. **222 videos as of the 2026-09-12 nightly sync (156 TikTok, 66 YouTube of which 26 classify as Shorts). Jas adds videos daily, so any count here is stale the moment it is written — never verify code against a number in this doc.**
- `content_analysis`: **104 of 222 analysed as of 2026-09-12 17:09 UTC**, 98 scored, **0 ref pairs, 0 boosted / 102 unknown ad status.**
- `performance`: daily snapshot per video — views, likes, comments, shares, saves, avgWatchTimeSeconds, retentionPct, followersAtCapture.
- **Snapshot history was thin at X2 time** (only 2026-08-18, 09-09, 09-10 existed, after the nightly-sync outage), so velocity and ad-split figures read "too new"/"no snapshot" for most videos until the nightly sync accumulates. Expected — the UI says so rather than showing blanks.
- YouTube: watch time + retention present. Shares always 0 (Data API doesn't expose them).
- TikTok: avgWatchTimeSeconds and retentionPct **always null** on the Display API. An API-choice limit, not a platform limit. X4 would fix it, but X4 has no start date (D20). `sync.ts` has a locked rule against deriving them meanwhile.
- **No ad data** beyond X1's manual entry.
- **No enrollment attribution.** Stripe enrollments carry no link to a video, ever.
- **Stripe enrollment counts are a floor, not a total** — see X-B2; D18 makes that permanent for months before M7.12.
- `VITE_API_WRITE_TOKEN` is inlined into the client bundle at build time and **must never be set on a hosted build**. As of X0 the dash does not read it at all.
- `Run log` (`/api/logs`) is an engineering debug view. No revenue, no content data.
- KPI tab was erased 2026-09-10 and rebuilt by X3 on 2026-09-11.
- Analyst Supabase project (`kmgltqfwtyhswqxjicab`) authenticates with an `sb_secret_` key as of 2026-09-12 — see X-B4.

## Not in scope
- Photos, carousels, stories
- Enrollment attribution at the video level — no data source exists
- Backfilling historical Interac / manual enrollments — D18
- Rebuilding the dash natively inside the portal (Option B)
- A separate sales product or repo — D16 puts X7 inside this dash
- A standalone hypothesis taxonomy exercise — dropped, see X-B3

---

## Track C — proposed video-improvement phases X10–X19

**Added 2026-09-19 (Pacific), at Jas's request. Status: PROPOSED, NOT IMPLEMENTED.** This extends the existing plan; it does not renumber X0–X9, reopen locked decisions automatically, or authorize deployment. The purpose is to improve the videos people actually make, not multiply dashboards. Each phase needs its own scoped implementation PR, acceptance checks and human review.

**Review boundary:** the complete X-series plan and the principal Analysis, Suggestions, metrics and correlation source files were reviewed at `milestone-2` commit `8c7dc2568f841bf7be550be1942484cf5f92e720`. This was a repository/design review, not a fresh analyst-database audit, production deploy verification, or a viewing of the video catalogue. Historical counts above are not current measurements. The current connection in this ChatGPT project is portal Supabase only; the historical X1 MCP-access note is not permission to run analyst SQL against the portal.

### Diagnosis: the missing creative loop

The existing loop is substantially built: collect platform snapshots → people describe videos → calculate patterns → suggest ideas → display outcomes. The proposed loop adds: understand audience need → choose a learning/business goal → prepare a filmable brief → review the actual edit → run a fair comparison → retain the lesson for the next brief.

Code-level gaps found in this review:
- `packages/agents/analyst/src/index.ts` reads content, performance and brand chunks for Suggestions, but not the full X1 analysis records or the stored X6 insight reports. `prompts.ts` sends top/bottom title-and-metric summaries, not a verified transcript or shot timeline. X6 being built does not mean the next-video generator consumes it.
- `packages/agents/analyst/src/analysis.ts` uses `(likes + comments + shares) / views`, while X2/X6 include available saves. It ranks a single mixed-platform array before selecting the top/bottom ten, despite the prompt's within-platform rule, and still joins by native video ID rather than the canonical UUID. These are concrete consistency risks; their actual production impact has not been measured here.
- `apps/dash/src/Analysis.tsx` is structured human input, not automatic audiovisual understanding. It captures broad format/hook/CTA fields, but no verified word-level transcript, scene timeline, first payoff, or edit version.
- `packages/shared/src/correlation.ts` scores engagement only and auto-matches suggestion outcomes by tag/format. That is useful exploratory evidence, but is not proof that one particular suggestion produced a particular video. The existing Posted/Skipped buttons in `Suggestions.tsx` already work and should not be rebuilt as a new feature.
- The X1 Shorts classification note uses a ≤60-second duration heuristic. Current YouTube rules include eligible square/vertical videos up to three minutes [R1]. Duration alone is insufficient; changing the threshold to 180 seconds alone would still misclassify videos.

**Statistical correction for future wording:** cross-platform twins hold more creative content constant, but not audience, distribution, timing, packaging or metric definitions. They are observational comparisons, not controlled experiments. Eight videos is the existing reporting floor, not a statistical-confidence guarantee. No new phase may turn those heuristics into causal proof or a fabricated confidence percentage.

### How this fits X0–X9 and Track B

| Existing area | Next action, not a rebuild |
| --- | --- |
| X0 / X-B4 | Preserve portal-only auth, server-side role checks and secret separation. Verify any outstanding credential cleanup before declaring it done. |
| X1 | Keep analysis and pairing; extend progressively in X11. Verify current coverage rather than repeating September 12 counts. No separate taxonomy project. |
| X2 | Reuse pure metric functions; X10 fixes inconsistency/provenance and supports fair comparison windows. |
| X3 / X-B2 | Keep enrollment incompleteness visible. No historical backfill and no invented video-to-enrollment attribution. |
| X4 / X5 / X-B5 | Still paused under D20. Before restarting, specify exact permitted endpoints, scopes and usable metrics; approval alone is not a guarantee of any requested field. X10–X18 do not wait for TikTok approval. |
| X6 | Keep its numeric engine, caution block and current score; feed verified evidence into better Suggestions. Any changed scoring or matching contract needs explicit approval. |
| X7 | Remains the sales slice of this app. X12 can start with manually redacted audience questions; X19 later consumes approved aggregate sales feedback. |
| X8 | Make hardening a release gate throughout this extension, not something deferred until every new feature ships. |
| X9 / X-B1 | Instagram is recorded as live. Repository state is ahead of parts of the older Facebook checklist; verify actual deployed commit, migration and logs before changing the live-status claim. Do not restart Meta access work. |

### X10 — Evidence foundation and Suggestions v2

**Implementation checkpoint 2026-09-20 — code and fixture tests, NOT SHIPPED.** Canonical UUID Suggestions joins, unchanged shared X2 percentage calculations (including saves), within-platform/age/format/exposure cohort sampling, X1 + stored X6 prompt evidence, validated UUID/run citations and saved evidence snapshots are implemented. New suggestions use their recorded source IDs in Idea map; historical X6 inference remains inference. Provenance fields persist availability and retain explicit observed zero; legacy endpoint/definition/availability is labelled unverified, never guessed from zero. X2's heuristic and X6's engagement score remain unchanged under **C4 NOT APPROVED**.

Migration `20260920055246_x10_evidence_budget.sql` is prepared, NOT applied: provenance storage and serialized per-call budget reservations (also used by X6 narrative calls without changing scoring). Missing cap/key/reservation service prevents paid calls; uncertain calls conservatively retain their reservation. SDK automatic retries are disabled; each explicit retry reserves again. No paid calls were made during implementation.

Remaining: native metric definitions/Shorts classification must be verified against authorized account data before ingestion can populate trustworthy native provenance. Historical rows are not backfilled or reclassified. Duration-matched evidence awaits X11 metadata; cohorts without eight comparable videos abstain from ranking. Full availability unification is blocked by C4. Production/migration verification is outstanding.

**Priority: first. Dependencies: existing X1/X2/X6.** Make the present system agree with itself before teaching it more creative rules.

Scope:
- One shared calculation contract across Metrics, Insights and Suggestions; canonical `content_uuid` joins; platform-specific ranking before sampling evidence; preserve metric units and which engagement components were actually observed.
- Consume X1 descriptions/hooks/format plus relevant stored X6 findings, cautions, counterexamples and dates. Every recommendation cites the actual content UUIDs and insight-run ID supplied to its prompt; validate those references. Do not manufacture source-video edges merely because tags match.
- Store metric provenance: native name, endpoint/source, observation window, capture time, denominator, definition version, and availability (`observed`, `unsupported`, `not_authorized`, `missing`, `error`). Observed zero must remain distinct from unknown. Do not infer an API's capabilities just because all stored values happen to be zero.
- Compare equivalent post ages and comparable formats/durations, with ad exposure marked known/unknown. Reuse X2's honest missing-history labels. A daily calendar snapshot is not an exact first-24-hour observation; timestamp-level precision needs timestamped captures.
- Audit Shorts classification against verified platform content type where available [R1/R3]; allow a human-reviewed override with provenance, and leave uncertain cases labelled uncertain. Audit views versus engaged views and watch-time denominators [R2] before combining historical measurements.

Acceptance: fixture tests show the same metric in all three surfaces; native-ID collisions cannot cross-link videos; no global cross-platform top-ten ranking; unsupported values never become measured zero; a recommendation can be traced to its actual evidence. Missing data produces a weaker recommendation or explicit abstention, not a confident story.

### X11 — Creative memory: understand what is in each video

**Implementation checkpoint 2026-09-20 — manual slice implemented; NOT SHIPPED.** Analysis now includes editable descriptive fields, separate writer/filmer/editor labels, approved HTTPS asset references with human-supplied version/fingerprint, reviewed classification overrides (annotation only, not historical metric reclassification), and timecoded human observations. Asset changes reset observation reviews. Immutable revision history records session actor/time, with optimistic concurrency and idempotent saves. Owner/marketing API gates and content-ID validation remain server-side. No asset is uploaded, downloaded or processed; multilingual review stays human.

`20260920060022_x11_creative_memory.sql` creates service-only revision storage, prepared NOT applied. Unit/API and isolated migration tests cover invalid references/times, review invalidation, role/ID checks, CAS and replay. Actual asset immutability/player timestamp support and multilingual sample review require human verification. Automated transcription/scene analysis is blocked by **C3 NOT APPROVED**.

**Priority: high. Dependencies: X10; media processing requires the asset/privacy decision below.** Extend Analysis instead of adding another manual form people must duplicate.

Start small: record intended audience/learner level, topic, purpose, spoken language mix, duration, opening line, first useful payoff, CTA position, and a link to the approved asset. These are descriptive fields attached to X1, not a revived independent hypothesis taxonomy. Keep idea origin separate from who wrote, filmed and edited.

Later, authorized source-file upload or an approved media source can produce a timestamped transcript and scene notes: spoken hook, on-screen hook, pauses, examples, B-roll, text density and CTA. AI proposes annotations; a human accepts/corrects them. Punjabi/French/English code-switching and French pronunciation require review. Missing audio, poor transcription and uncertain visual observations must be visible; never invent a transcript from the post title.

Store an asset/version fingerprint, annotator/model version, review state and source timestamps. A new edit invalidates the old timestamped review. Analyse approved samples first; do not automatically process the whole archive.

Acceptance: Jas/Eknoor can correct a transcript or tag without losing provenance; a brief can retrieve relevant examples and non-examples; each timestamped observation opens the matching version and moment. Manual-only use remains possible without buying or enabling a video model.

### X12 — Audience questions and topic opportunities

**Priority: high. Dependencies: X10; manual-first, not blocked by X7.** Answer “What should we help our viewers with?” before asking “What format got views?”

Build a small research inbox of approved comments, recurring learner questions, and redacted sales objections. Begin with manual text/link entry. Direct comment/WhatsApp ingestion is a separate permission and source-format task; the current read-only video scopes must not be assumed to authorize it.

Cluster questions such as speaking hesitation, pronunciation confusion or course-fit uncertainty; retain source, date, context and verified occurrence counts. Separate learning questions, purchase questions, general reactions and spam. These examples are proposed categories, not claims about the current inbox. Do not infer a commenter's immigration status or other sensitive personal traits.

Recommend opportunities using stated audience relevance, genuine question frequency, recent coverage, teaching usefulness and production effort. Show reasons and evidence rather than an unexplained “viral score.” Allow a small human-selected reference library of public creator videos to study structures; do not copy scripts, scrape private data, or invent competitors' retention, spend or sales.

Acceptance: each topic links to real authorized evidence or is clearly marked “creative exploration”; duplicate messages do not inflate demand; marketing sees redacted themes, not private conversations. One chosen topic can become an X13 brief.

### X13 — Hook, script and teaching-brief lab

**Priority: highest direct creative value. Dependencies: X10 plus lightweight X11; X12 enriches it.** Turn a suggestion into something Jas can actually film and an editor can understand.

For a human-selected topic, prepare a versioned brief with one intended viewer, one learning outcome, a platform, target duration, one primary success measure and one next action. Offer a few genuinely different hooks: demonstration/challenge, relatable problem, or specific useful result. Explain the audience fit and cite own-channel examples when available; never promise a view count.

After a human chooses a hook, draft the spoken script, first-frame text, visual beats, B-roll needs, subtitles, payoff and CTA. Use Punjabi/English/French only as chosen for that brief. Include both a complete lesson and space for the learner to try, rather than sacrificing clarity for constant cuts. TikTok's hook/body/close guidance is an optional creative scaffold from advertising, not proof of organic performance for FWJ [R6].

Extend the existing banned-topic and brand-voice gates to draft outputs, then add checks for French accuracy, learner-level fit, misleading promises and unsupported course/TCF/immigration claims. Prices, schedules, links and policy claims require an approved dated source or human confirmation. Human review remains mandatory; the AI does not publish.

Acceptance: a selected suggestion becomes a ready-to-film brief with sources, clear visuals and a meaningful ending; Jas can edit and approve it; rejected hooks/revision reasons are retained. This phase proposes human-reviewed drafting and therefore requires updating the old generator's “never write content” contract explicitly, without adding a publish capability.

### X14 — Production board and pre-publication edit review

**Priority: high. Dependencies: X11/X13; manual checks can ship first.** Connect research and scripts to the actual edit, rather than losing feedback in messages.

Use one production item per creative concept, with a lightweight path: selected → brief approved → filmed → edit review → approved → posted → reviewed. Track versions, owner, due date, asset links, blockers and requested changes. This extends the existing suggestion status; it does not replace Posted/Skipped or confuse an approved draft with a posted video.

Proposed handoff: Eknoor prepares evidence and the brief; Jas approves teaching/content and records; Loop Studio edits; Jas or an authorized reviewer approves the export. Keep these responsibilities configurable. Loop Studio remains a collaborator label, not an automatically granted portal role or a recipient of revenue/private lead data.

A draft-review checklist covers intelligible speech, music masking speech, correct French/subtitles, safe text placement for the chosen platform, readable examples, hook-to-payoff consistency, unnecessary repetition, rights/consent and the single CTA. When an actual reviewed video is available, attach timecoded comments and version-specific fixes. Distinguish measurable defects from editorial suggestions; do not claim a retention drop before observing viewers.

Acceptance: an editor gets a usable brief and a finite revision list; every approval names the exact asset version; rights/consent and factual checks cannot silently disappear on revision. No automated editing, rendering or upload service is required for the first release.

### X15 — Retention and moment-by-moment diagnosis

**Priority: high when data is available. Dependencies: X10/X11, plus verified analytics access.** Explain where a video may lose or regain attention, not merely its average engagement.

Start with owned YouTube videos for which the account can actually retrieve retention data. Test the Analytics API report shape, scopes and coverage before committing to the UI [R2/R3]. An authorized export/manual import is an optional fallback when available, labelled by source and period. Add other platforms only after verifying equivalent metrics; X4 is not a dependency for the YouTube slice.

Align genuine retention samples with the verified transcript/scene timeline and distinguish “observed dip here” from “possible explanation: lengthy setup.” Spikes may reflect rewatching because a section is useful OR confusing [R4]. Compare with similar-length, similar-purpose content and report missing intervals/sample limitations.

Keep hook hold, average watch time, average percentage viewed, completion, replay and saves/shares separate when actually exposed. Never reconstruct a retention curve from average watch time, infer completion from average duration, or treat a skip rate as retention. A source video's duration or metric denominator can change how the number should be read.

Acceptance: a reviewer can inspect the underlying data and the corresponding moment; the system proposes a specific next-edit test, not a causal verdict. Without a real curve it says “timestamp-level audience data unavailable” and may offer only clearly labelled editorial feedback.

### X16 — Creative experiment register

**Priority: high. Dependencies: X10/X13; X15 is optional enrichment.** Replace “this went viral, repeat everything” with deliberate, interpretable tests.

Before posting, register the hypothesis, target audience, platform, format, one principal creative change, chosen metric, observation window, eligible videos and review rule. Possible tests: demonstration-first versus explanation-first; early worked example versus long setup; two CTA wordings. These are proposals to test, not established winners.

Use repeated matched episodes where practical; show audience/timing/duration/paid-exposure differences. Organic posts published at different times are observational trials, not randomized A/B tests. Cross-platform twins are likewise not randomized. Record inconclusive and negative results, not just wins. Show sample sizes and uncertainty; do not call the current n≥8 floor proof. Native simultaneous tests may be recorded when genuinely available; YouTube title/thumbnail tests have eligibility limits and do not currently cover Shorts [R5].

Require equal-age outcomes and a preset evaluation point; account for thin history and avoid declaring a winner after every daily fluctuation. Do not mix incompatible view definitions or boosted and unknown-exposure videos into a purported organic comparison. Any causal/statistical-significance claim needs an appropriate experimental design and reviewed method.

Acceptance: each experiment yields “adopt provisionally,” “repeat,” “stop,” or “inconclusive,” with evidence and limitations. Implementation needs the outcome-linking decision below so a specific brief/version is associated with the correct posted videos rather than merely a shared format tag.

### X17 — Platform packaging and repeatable series

**Priority: medium; useful after the brief workflow. Dependencies: X11/X13/X16.** Reuse a strong lesson without blindly uploading the identical package everywhere.

Keep a parent concept with linked platform-specific versions: hook, length, captions, cover/first frame, description, title where relevant, CTA, publish record and experiment link. Preserve X1 twins for genuinely comparable posts, but label materially different edits as variants rather than identical twins.

Build small repeatable series, for example a speaking challenge, a common-mistake correction or a real-life French scenario. Those are candidate series, not a claim about what already performs best. Use each episode's learner promise and production requirements to make batching possible. Suggest sequels or shorter extracts from verified useful moments, with human review; do not recycle a high-view clip solely because of its views.

Packaging review must match the video: no misleading title or cover. Native YouTube title/thumbnail test results can be recorded for eligible long-form uploads; this is not an API promise or a Shorts feature [R5]. Refresh platform guidance at implementation rather than baking today's recommendations permanently into prompts.

Acceptance: one approved concept can produce distinguishable, human-approved platform briefs; outcomes roll up without counting twins as independent creative experiments; the schedule balances useful repetition with new ideas. Publishing remains manual.

### X18 — Evidence-backed creative playbook and weekly decisions

**Priority: medium, after real experiments. Dependencies: X10/X16, enriched by X12–X17.** Make lessons persist without turning a handful of successes into permanent rules.

Store learning cards with the context, proposed principle, source videos/experiments, counterexamples, observation date, confidence expressed in plain language and next review date. Separate editorial preferences from measured findings. A human can promote, revise or retire a card; newer contradictory evidence must be visible.

Suggestions retrieves this playbook plus the actual experiment evidence, accepted edits, and reasons ideas were skipped. Deduplicate near-identical proposals. Reserve a human-chosen exploration slot rather than only cloning historic high performers. A recent popular post is not a universal rule for all platforms or learner levels.

Produce one review view answering: what to repeat, what to change, what to test, and what remains unknown. Attach an owner and next production item. Reuse existing Slack delivery only after explicit configuration; do not silently change the current manual-run Slack behaviour or create another cron service by default.

Acceptance: a completed experiment can change the next proposed brief; every asserted lesson opens its evidence; unsupported or stale rules can be retired. Track real workflow usefulness, including filming-ready briefs, turnaround/revisions, experiments completed, and age-matched performance. Generated suggestion count alone is not success.

### X19 — Qualified-response feedback from the sales slice

**Priority: later. Dependencies: X7, X10 and an approved privacy/permissions contract.** Help the creative team attract suitable learners without turning the marketing dashboard into a private CRM.

Begin with aggregate, redacted feedback from Harman: recurring course-fit questions, expectation mismatches, objections and voluntarily stated content references. Define what “qualified inquiry” means with the business before counting it. A request for course information is not the same as a like, a comment, a booking or an enrollment.

Feed approved themes into X12/X13, so videos answer real uncertainties and set accurate expectations. Marketing receives themes only by default; lead identities, conversation bodies, enrollment totals and revenue do not become visible through prompts, exports or this new panel. Do not pool FWJ with unrelated personal-vlog or product-brand data.

**Boundary:** this phase does NOT implement video-level enrollment/revenue attribution, join the two Supabase databases, backfill history, or claim a video caused a sale. Future opt-in source links, tracked landing pages or consented self-report would be a separate proposal requiring an explicit reopening of the current attribution exclusion and portal-side scope. Self-report would still be reported association, not causal proof.

Acceptance: the next brief can cite an approved anonymous audience theme while an API/role test demonstrates that marketing cannot retrieve the underlying lead or dollar data. No growth claim is made from a missing denominator.

### Proposed implementation order and release gates

**Wave 1 — trust and a usable creative workflow:** X10 → lightweight X11/X12 → X13 → manual-first X14. This is the recommended first investment for better videos; it does not require TikTok Business approval or a full CRM. Pilot a small, human-selected set of upcoming videos rather than automatically backfilling every asset.

**Wave 2 — learn from outcomes:** X15 where supported + X16 → X17 → X18. Observe a complete predeclared evaluation window before deciding the pilot improved performance. Record production effort as well as audience outcomes, and retain inconclusive results.

**Wave 3 — business feedback:** X19 once X7 and the privacy contract exist. X4/X5 may proceed independently only after D20 is explicitly revisited. Close X9's production verification separately; do not confuse a docs merge with a live integration test.

**X8 release gates for every wave:** migrations tested on the correct analyst project; role/IDOR tests; schema and prompt-output validation; retries/idempotency; stale-data notices; provenance tests; model/prompt version logging; spend reservation before paid calls including retries/concurrency; safe degradation when a budget/source is unavailable; reversible rollout. Media jobs, if approved, need bounded queues, file validation, private storage, signed access, deletion/retention handling and failure recovery. No new model, vendor, subscription or spending is enabled by this roadmap PR.

**UI restraint:** extend existing Analysis, Suggestions, Metrics, Insights and Idea map first. Consider at most a focused Studio/Production workspace and an Experiments view if the workflow proves it needs them. Ten phases do not mean ten new sidebar tabs, ten agents, or ten deployments.

### Decisions required before implementation changes locked behaviour

- **C1 — Human-reviewed drafting:** approve expanding the old next-video generator into scripts/production briefs. The no-publishing rule, brand gates and factual review remain.
- **C2 — Exact creative lineage:** approve supplementing X6's locked auto-only matching with explicit brief/version → published-video links and optional human confirmation. Keep historic automatic links labelled inferred; never relabel them as confirmed retroactively. X1's existing paste-ID pairing workflow is not replaced without a separate decision.
- **C3 — Media and privacy:** choose permitted asset sources, storage location, retention/deletion, access roles, model/vendor, cost ceiling and a reviewed multilingual sample before audiovisual processing. Do not import private messages or student media merely because a connector exists.
- **C4 — Metric/scoring changes:** approve any alteration to X6's engagement-only score or X2's locked availability heuristic. X10 can propose the improved contract, but must not silently rewrite historical figures or strip existing cautions. An objective-specific measure in a new experiment is not a retroactive change to X6.
- **C5 — Sales-theme sharing:** approve the redaction, aggregation and role contract before X19. Video-level enrollment attribution remains excluded unless separately reopened; this roadmap does not grant that approval.

### Primary-source checks used for these proposals

External documentation was checked for this review; availability must be rechecked against the actual account, API version and granted scopes when a phase is implemented. Platform guidance is a starting hypothesis, not an FWJ performance result.

- **[R1] YouTube — three-minute Shorts:** https://support.google.com/youtube/answer/15424877 . The documented classification includes duration, aspect ratio and upload-date conditions; a 60-second-only heuristic is inadequate.
- **[R2] YouTube Analytics — metrics:** https://developers.google.com/youtube/analytics/metrics . Use the native definitions for views, engaged views, watch time and retention; do not invent interchangeability or missing curves.
- **[R3] YouTube Analytics — dimensions:** https://developers.google.com/youtube/analytics/dimensions . Investigate supported content-type and retention-report dimensions for the authorized account; a documented field does not prove current ingestion.
- **[R4] YouTube — key moments for audience retention:** https://support.google.com/youtube/answer/9314415 . Retention can inform moment-level review; a spike can also mean viewers needed to revisit an unclear section.
- **[R5] YouTube — A/B test titles and thumbnails:** https://support.google.com/youtube/answer/16391400 . Native concurrent tests have eligibility limits, currently exclude Shorts, and use watch-time-based results rather than simply click-through rate.
- **[R6] TikTok — Creative Codes:** https://ads.tiktok.com/business/en-US/creative-codes . Hook/body/close and platform-aware creative guidance are advertising guidance to test, not evidence of guaranteed organic reach.
