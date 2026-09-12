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

Built: `packages/shared/src/correlation.ts` (pure, node:test, 14 cases) · `insights` agent (`capability analysis.insights`, no tools) · `apps/orchestrator/dist/insights.js` cron entrypoint · `GET /api/insights/latest`, `/runs`, `POST /api/insights/run`, `POST /api/insights/tags/:id` · `Insights` panel third in the nav · Idea map X6 edges · Slack summary via `postSlackText`. Tables (migration 0011): `insight_runs`, `hypothesis_suggestions`.

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
**X-B1's blocker is cleared (2026-09-12) — access is resolved; what remains is Meta enabling the metrics, expected around Tue 2026-09-15.**

- Both expose Reels/video watch time, so the X1–X6 pipeline extends without redesign.
- **X-B1 is permission; X9 is the build.** Permission landing does not put a single Instagram row in `content` — the integration still has to be written, and Meta app review may add delay.
- Once X9's sync runs, Instagram videos appear on X1's `/analysis` page automatically. No X1 rework.
- With the access blocker gone, X9 can be scheduled on its own merits.

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
