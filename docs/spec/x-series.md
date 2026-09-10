# The X-series — one plan for marketing + sales

Status as of 2026-09-10. **This is the single plan.** Everything previously scattered across `content-analysis.md`, the M4.5 "open items from 4.5" list, and the M6/M7 placeholders is consolidated here, ordered by what has to happen first.

Milestones are prefixed X to keep them apart from the historical M-series (M1–M5 describe what was already built; they are history, not a plan).

**Renumbering note:** the 2026-09-09 draft numbered content analysis as X1. Auth turned out to block it, so auth became X0 and the rest shifted. Old X1→new X1 (unchanged), old X2→X2, old X3→X4, old X4→X5, old X5→X6, old X6→X9.

---

## Where things actually stand

Built and live: the analyst pipeline (TikTok + YouTube + Stripe sync, nightly at 07:00 UTC), the suggestions agent with its two unskippable safety checks, Slack delivery, and the hosted dashboard at `analyst-dash-production.up.railway.app`.

X0, X1, and X2 are done — see below. Not built: X3 onward.

**X0 shipped 2026-09-10.** Nobody needs a password for this dashboard anymore; access is entirely through the portal.

---

## Track A — code, in order

### X0 — Access: portal Google login → dash
**Why first:** Eknoor cannot be given the dashboard at all until this exists. Every other milestone is work she can't reach. Also removes a static password currently guarding revenue data on a public URL.

**Status 2026-09-10: SHIPPED AND VERIFIED END TO END.** Portal PR #11 and analyst PR #19 merged. `dash-token` deployed and configured. Owner click-through confirmed live (`handoff ok: owner learn@frenchwithjas.ca` in the Railway deploy log, matching a `200` from `dash-token`). `DASH_PASSWORD`/`DASH_USER` retired on Railway and the `/auth/basic` transition route removed in a follow-up PR. The portal is now the *only* door, permanently — not just by policy but because no other door exists in the code anymore.

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
- The interim HTTP Basic fallback (`/auth/basic`, `DASH_USER`/`DASH_PASSWORD`) that bridged the switchover has been removed entirely — deleted from the code, and the credentials unset on Railway. There is no code path left that checks a password.

**Route → role (enforced in `apps/api`, mirrored in `apps/dash/App.tsx`):**
- owner, marketing: `/api/me`, `/api/suggestions`, `POST /api/suggestions/:id/status`, `/api/content-performance`, `/api/analysis/*` (X1), `/api/metrics` (X2)
- owner only: `/api/kpis`, `/api/kpis/monthly`, `/api/logs`

**Role permissions (locked, mechanism-independent):**
- `owner` — everything.
- `marketing` — Analysis, Suggestions, Idea map, Performance, Metrics. **No revenue anywhere.** No Run log.
- `salesman` — nothing on this dash yet; revisit at X7.

**Verification record (2026-09-10):**
- `dash-token` invocation log: two `503 not_configured` at 14:22 UTC (secrets not yet saved on the Supabase side), then `200` at 14:29 UTC once saved.
- `apps/api` deploy log at that same moment: `handoff ok: owner learn@frenchwithjas.ca`.
- Marketing-role behaviour verified pre-ship by direct API test (not a live Eknoor click-through): a minted `marketing` token got `403` on `/api/kpis`, `/api/kpis/monthly`, `/api/logs`, and `200` on `/api/suggestions`, `/api/me`, `/api/content-performance`. A live click-through as Eknoor herself is still worth doing when convenient, but the server-side role gate — not the dash's panel list — is what actually protects the routes.

### X1 — Eknoor inputs content analysis
**Confirmed 2026-09-10:** Supabase MCP has full read/write access to the analyst project (`kmgltqfwtyhswqxjicab`), verified with a live `execute_sql` call — not just the portal project. Not a blocker for X1.

**Status 2026-09-10: SHIPPED, plus four follow-ups the same day.** PR #22 squash-merged to `milestone-2`; Railway `analyst-dash` deployment `c2ff086e` built clean and booted (`API + dash on port 8080`). Migration `0005_content_analysis.sql` applied to the analyst project via MCP before merge. All five sub-decisions below were locked before any code. X0 auth code untouched. Live-verified: Eknoor herself opened the dash through the portal (`handoff ok: marketing www.eknooor919@gmail.com`, Railway deploy log, 18:15 UTC) — the one outstanding item from the initial ship.
- Built: `content_analysis` table (RLS on, service_role only) · `GET /api/analysis` (every video + latest snapshot + analysis + ad runs + ref pairs + chip list) · `GET /api/analysis/ref/:platformVideoId` (paste-ID echo) · `PUT /api/analysis/:contentId` (upsert; validates every ref is real, not self, different platform; canonicalises `idea_source`; **writes `content.hook/.format/.hypothesis` every save**) · `Analysis` panel first in the dash nav for owner + marketing.
- `content.hypothesis` for now is a mechanical tag from the structured fields — `<format-slug>[+model][+cta:<type-slug>]`, e.g. `talking-head+model+cta:comment` — so the suggestions agent has something to group on today. X6 replaces it with tags derived from the free-text description.
- **PR #24 (styling):** dark fields, purple focus ring, custom select chevron, pill chips, styled checkbox, primary/ghost buttons — the form controls no longer use unstyled browser defaults.
- **PR #26, migration 0006 (locked 2026-09-10):** the single `cross_platform_ref` column and plain boolean `ad_boosted` are gone, replaced by:
  - `content_analysis_refs` — a join table, not a column. A video can pair with **more than one** other video at once (its YouTube twin *and* its Instagram twin simultaneously, once X9 lands). Written in both directions on save, so either side of a pair shows the other without re-entering it. Form shows existing pairs as removable chips + a paste-ID box to add more.
  - `ad_boosted` is now **tri-state** (`true` / `false` / `null` "don't know") — form shows Yes / No / Don't know chips, not a checkbox. Ad status is independent per video, so one platform's twin can be boosted while the other isn't; this field only ever describes the video it's on.
- **PR #28, migration 0007 (locked 2026-09-10):** `ad_start_date`/`ad_end_date`/`ad_spend_cents` moved off `content_analysis` into a new `content_ad_runs` child table — a video can be **re-boosted more than once** over its life, each run with its own dates and spend. **Per-run only, no auto-summed total** — a combined figure is computed at report time in X5, not stored here, so future reporting decisions (e.g. summing only runs inside a window) aren't pre-baked into the data. Form shows a growable "+ Add another run" list under Ad boosted = Yes.
- **PR #29, migration 0008 (locked 2026-09-10):** YouTube Shorts are now a distinct `content.platform` value, `youtube_shorts`, separate from regular `youtube` videos — not a subtype field, so the platform-agnostic Analysis filters/pairing pick up the new bucket with zero dash code changes. YouTube's Data API has no official Short/long flag (confirmed via research); classification is by `contentDetails.duration` ≤60 seconds, the standard heuristic — imperfect (a rare sub-60s landscape video would misclassify), but the best signal available. Existing rows mislabelled `youtube` self-correct on the next nightly sync (07:00 UTC) via `content.reclassifyPlatform`, which relabels the existing row *in place* by id rather than inserting a duplicate — no manual backfill, no `content_analysis`/refs/ad-runs FK breakage.
- **Still to verify live:** Eknoor tagging one actual video end to end (save → confirm it appears correctly, including a ref and an ad run). She has opened the dash; a saved analysis hasn't been confirmed in the logs yet.

**Why second:** it is the only milestone that produces genuinely new information rather than rearranging what exists. X6 cannot learn anything without it, and it takes human time to fill, so starting it early means the data is ready when the agent is.

**X1 is also the replacement for the old hypothesis-taxonomy effort** (dropped 2026-09-10, see Track B history). `content.hypothesis` gets populated from Eknoor's structured descriptions rather than from a separate hand-built taxonomy — so the mapping onto `content.hook` / `.format` / `.hypothesis` below is not a nice-to-have, it is now the only path by which those columns ever get filled. Treat it as required scope, not an optional extra.

- New table `content_analysis`, one row per content row: description (free text), hook_text, format, has_model, has_cta, cta_type, ad_boosted (tri-state), idea_source, analysed_by, analysed_at. Cross-platform pairs live in the separate `content_analysis_refs` join table (0..N per video); ad campaign dates/spend live in the separate `content_ad_runs` child table (0..N per video) — see the follow-ups noted above.
- `/analysis` page in `apps/dash`: every video in `content` with title, posted date, latest views/likes/comments/shares, watch time where present, and a per-video form. Added to `App.tsx`'s nav and `PANELS_BY_ROLE` for owner + marketing.
- **REQUIRED — build platform-agnostic.** Do NOT hardcode `platform IN ('tiktok','youtube')` anywhere in the query, the UI, the filters, or the schema. The page lists whatever platforms exist in `content`, and the platform filter is derived from the distinct values actually present. When X9 lands and Instagram rows start arriving from the nightly sync, they must appear on this page with **zero changes to X1 code**. Same for any future platform. Missing metrics per platform are already handled by the "show only where present" rule below — that is the same mechanism.
- **`idea_source` field, locked 2026-09-10 (Jas):** who had the *idea* for the video — not who filmed it, edited it, or posted it. Known values so far: AI agent, Jas, Eknoor, Loop Studio (marketing contractor), Harman, Manjot, Other — and this list will keep growing as testing continues, so it must not be a rigid CHECK-constraint enum; adding a new source later should need no schema migration and no deploy. Loop Studio and Manjot are content-idea sources only — they are not portal roles, do not touch `profiles.role` or `access_status` for them. Existing/legacy videos get `idea_source = NULL` and stay NULL — there is no backfill. Only videos analysed from X1 onward get it filled in; NULL on an old row is expected, not missing data.
- `/api/analysis/*` read + write routes, authenticated by the X0 session cookie via `requireRole('owner','marketing')` — never by a baked-in `VITE_` token.
- **Required:** every submitted analysis also writes `content.hook` / `.format` / `.hypothesis` on the matching content row, so the existing suggestions agent benefits and the tagging gap closes. This is the only path that ever fills those columns.
- Show per-platform metrics only where present; never derive or fill a missing one.
- **Ad data is manual entry here.** A true paid/organic split needs X4. Confirmed 2026-09-10: Eknoor has TikTok Ads Manager and Meta Ads Manager access on both accounts, so `ad_boosted`/dates/spend are a lookup she can confirm per video, not a guess from watching the feed — neither platform shows a persistent "this was boosted" marker on the post itself once a campaign ends, only inside the respective Ads Manager. The form hint points her there directly. This does not become automatic later: X4's `impression_sources` can eventually corroborate ad *presence* for TikTok only (a non-zero paid share), but it has no timeline (so never supplies the dates) and no spend figure (no API here ever exposes what was actually paid), and it says nothing about Instagram at all. These three fields stay manual scope for the foreseeable future, X4/X6 included.

**Sub-decisions locked 2026-09-10 (Jas):**
- `idea_source` — plain `text` column, **free text with quick-pick chips**. Chips = the seeded known list ∪ `SELECT DISTINCT idea_source` from saved analyses, so a brand-new name becomes a chip after its first use — no migration, no deploy, no admin screen. On save the server trims and matches case-insensitively against existing values, so "jas" / "Jas " collapse onto the existing "Jas". Lookup table rejected.
- `format` and `cta_type` — **dropdowns**, each with an `Other` option that reveals a free-text box. Stored as `text` with no CHECK constraint, so promoting a recurring "Other" value to a real option is a UI-list edit, not a migration.
  - format: Talking head · Skit · Screen/text overlay · Voiceover B-roll · Duet/Stitch · Live clip · Other
  - cta_type: Comment · Follow · Link in bio · DM · Enrol/Book · Save/Share · None
- `cross_platform_ref` — Eknoor **pastes the paired video's platform video ID**, and can add more than one (superseded by migration 0006 — see the PR #26 follow-up above; originally scoped as a single ref, now `content_analysis_refs`). The server validates each one exists in `content.platformVideoId` and sits on a *different* platform from the video being analysed; the form echoes the matched title + platform so she can confirm before adding. Title search rejected.
- **Editable after submit.** Save is an upsert keyed on `content_id`; `analysed_at` refreshes on every save. Ad end dates and spend are usually unknown at first analysis, so write-once would block exactly the fields that arrive late. The `/analysis` list shows an **Analysed / Not yet** badge per video with a filter, so untagged videos are easy to work through.
- `analysed_by` — **auto-filled from the session** (`/api/me` email). No form field.

**Sequencing note (Jas, 2026-09-10):** Jas would prefer Meta access (B1) resolved before Eknoor starts tagging, so she covers all platforms in one pass rather than revisiting videos later. Recorded as a preference, with the trade-off stated plainly so the choice stays deliberate:
- B1's timeline belongs to a third party and may be days, weeks, or never. Gating X1 on it means Eknoor has nothing to do for an unknown period.
- Even after B1 clears, Instagram data does not appear until X9 is **built** — B1 is permission, X9 is the integration. Meta app review may add further delay.
- Tagging is per-video and incremental, so nothing is wasted by starting with the TikTok/YouTube videos already in hand (count moves daily — see Data reality note below, never verify against a specific number). Instagram videos would simply join the same list later.
- The platform-agnostic requirement above is what makes waiting unnecessary — it exists precisely so the page doesn't need rework when Instagram arrives.
- **If B1 has not cleared by the time X0 finishes, start X1 anyway.** X0 is done, so this default is now live: start X1.

### X2 — Derived metrics
**Why third:** pure computation over data that already exists plus X1's fields. No external dependencies, no approvals, nothing can block it.

**Status 2026-09-10: SHIPPED.** PR #31 squash-merged to `milestone-2` (commit `46bbdf3`). Migration 0009 applied to the analyst project via MCP before merge. Three sub-decisions locked before any code (below).
- Built: `packages/shared/src/metrics.ts` (pure functions, `pnpm --filter @platform/shared test` runs 5 node:test cases) · `GET /api/metrics` (owner + marketing) · `Metrics` panel second in the dash nav, one card per video with its 0..N twins as side-by-side columns and a "With twins only" filter.
- Shares on a platform count as reported iff any snapshot on that platform has ever recorded a non-zero share count — derived from data, no hardcoded platform list. YouTube therefore shows share rate "n/a", not 0%.
- The ad split's label is a field on the payload (`adSplit.label`, `adSplitLabel`), not UI copy, so any renderer, export, or agent that reads the JSON carries it.
- **Still to verify live:** Jas checking the deployed dash directly (Railway auto-deploys `analyst-dash` from `milestone-2` on merge).

Scope, per video:
- comment rate, share rate, engagement rate (as % of views). Engagement = likes + comments + shares + saves. Rates are computed from the **latest** snapshot. Where a platform never reports a metric (YouTube shares are always 0 — Data API), the rate is shown as "n/a" on that platform, not 0%.
- view velocity: views at day 1 / 7 / 30 after `posted_at`, from snapshot history.
- follower-normalised views: latest views ÷ `followers_at_capture` from the **earliest** snapshot on or after `posted_at` (the closest thing to "followers at post time" the data holds). Labelled with the snapshot date used.
- cross-platform side-by-side for paired videos — one column per twin, **0..N twins** via `content_analysis_refs`, not a single pair. Each column shows the same metric set; metrics a platform lacks show "n/a".
- before/after-ad view split from snapshots + X1's manual ad run dates — **a time split, not a true paid/organic split. Label it as such wherever it appears — UI, exports, logs, agent input.**
- `GET /api/metrics` (owner + marketing, X0 session), `Metrics` panel in the dash.

**Sub-decisions locked 2026-09-10 (Jas):**
- **Multiple ad runs → combined split.** Views are attributed by snapshot delta: for each consecutive snapshot pair, the views gained are assigned to *inside* if the interval overlaps any ad run window, else *outside*. Output is two numbers per video — "views gained during ad windows" and "views gained outside ad windows" — regardless of how many runs there are. Not per-run, not most-recent-only. A run with a `NULL` `end_date` is treated as still open (runs to today). Per-run breakdown deferred to X5 alongside cost-per-view.
- **Velocity with missing history → nearest earlier snapshot, flagged.** If no snapshot lands on exactly day N, use the latest snapshot at or before day N and show the actual age it came from (e.g. "1,240 (day 5)"). Two blanks, never a number: video is younger than N days → "too new"; no snapshot at or before day N exists → "no snapshot". Never interpolate, never show the current total in a velocity slot.
- **`performance.content_id` → migrate now.** Migration 0009 adds `performance.content_uuid uuid REFERENCES content(id) ON DELETE CASCADE`, backfills from `content.platform_video_id` (verified 2026-09-10: all 636 existing rows match a native id, zero match a UUID; 636/636 filled after apply), indexes it, and a `before insert or update` trigger fills it whenever it is null — the sync writer needs no lookup and dry-runs are unaffected. Gotcha found while building: the nightly upsert lands on the `(content_id, captured_date)` conflict path as an UPDATE, so the client must never send `content_uuid: null` (it would blank the FK); the trigger fires on any update as a second guard. All X2 joins use `content_uuid`; the `/api/analysis` and Performance-panel joins moved over in the same PR. The old text column stays for now (dropping it is a follow-up once nothing reads it), and the stale schema comment in `performance.ts` is corrected. This closes the M4.5 ambiguity for good.

### X3 — KPI view, rebuilt
**Why here:** the old KPI tab was erased 2026-09-10 (it printed revenue in plain text). It needs redesigning around roles, which only exist after X0.

**Ordering with B2 reversed 2026-09-10 (Jas).** B2 no longer blocks X3 — it is the other way round. Reconciling enrollment numbers in the abstract means guessing at a gap; it is far easier once a concrete view shows which months are short and by how much. So **X3 builds the view first, and the view is what makes B2 doable.**

This puts a known-incomplete number on screen, which is fine only if the screen says so:
- The view must **label the Stripe-visible figure as incomplete on its face** — not in a footnote, not in a tooltip. E-transfer and manual invoices bypass Checkout and are invisible to this system.
- Show the month-by-month shape, since that is what makes the gap diagnosable — a month that looks right and a month that looks half-missing tell different stories.
- **Never present the Stripe figure as total enrollments or total revenue** anywhere in the UI, in Slack output, or in agent rationales. It is "enrollments we can see," and the naming should say so.
- Once B2 resolves, revisit whether the manual figures can be entered or imported so the view becomes complete rather than merely honest.

Other X3 scope:
- Redesign from scratch; the backend routes `/api/kpis` and `/api/kpis/monthly` still exist untouched.
- Revenue visible to `owner` only. If marketing needs enrollment counts without dollar figures, that is a separate endpoint — never a filtered view of the revenue one.
- KPI 3 ("4 videos/week hypothesis-tagged") was previously blocked on the dropped taxonomy work. It is now measurable off X1's output instead — re-derive the metric from `content_analysis` coverage rather than the old CSV.

### X4 — TikTok Business API migration
**Why after X2:** unlocks real TikTok watch time, which every metric in X2 currently has to skip. Placed here rather than earlier because it needs external approval that can't be rushed.

- Replace/augment `packages/integrations/src/tiktok/` Display API calls with the Business/Insights API.
- Unlocks `average_time_watched`, `total_time_watched`, `full_video_watched_rate`, `video_duration`, `reach`, and `impression_sources`.
- `impression_sources` gives a paid-vs-organic view split **without any Ads API** — this is the real prize.
- Prerequisites: TikTok Business account, new app registration and approval, new OAuth scopes. Non-trivial; scope before starting.
- The "never derive retention" rule stays. This fetches real values; it does not infer them.

### X5 — Ad analytics
**Depends on X4.**

- Real paid/organic split from `impression_sources`, replacing X2's time-based approximation.
- Cost per view and cost per enrollment-in-window, using X1's manual spend entries.
- Per-run before/during/after breakdown (X2 ships the combined split only).
- Ads APIs (TikTok Marketing, Google Ads) only if spend grows enough to justify separate app approvals. Not before.

### X6 — Agent correlation + the closed loop
**Depends on X1 having real volume — roughly 50 analysed videos. Can start before X4/X5.**

- New agent task: read `content_analysis` + performance + X2's derived metrics, output what works and what doesn't, with the evidence for each claim.
- **Required, locked 2026-09-10 (Jas): break results down by platform, not just overall.** "What works" must be answerable as "what works on TikTok" and "what works on YouTube" separately, not one blended answer — the same format or idea source can perform differently per platform, and a pooled number hides that. `platform` is already a field on every row X6 reads (X1 built it platform-agnostic for exactly this), so this is a grouping requirement on the agent's own output, not new plumbing. **The X1 cross-platform ref pairs (migration 0006) are the strongest evidence for this** — when the same video exists as a TikTok/YouTube (and later Instagram) pair, X6 can compare identical content across platforms directly, hook/format/idea_source held constant, platform the only thing that varies. Claims drawn from a pair are stronger evidence than claims pooled across unrelated videos, and X6 should say so explicitly when it has a pair to point to.
- Auto-suggest `hypothesis` tags from Eknoor's descriptions.
- **Idea map edges** (carried over from the M4.5 open list): draw suggestion → source videos → outcome, so the map shows whether an idea actually worked. Belongs here — the data to draw those edges is exactly what this milestone produces.
- **Standing caution:** a couple hundred videos with ad-spend confounds is enough for patterns, not proof. Outputs are hypotheses to test, never conclusions. Anything touching enrollments is time-correlation only — Stripe carries no link to a video, and no amount of analysis creates one. If B2 is still unresolved, that caution is stronger, not weaker: the enrollment denominator itself is incomplete.

### X7 — Sales analyst (was M6)
**Deliberately last of the build work.** Marketing has real data flowing and a person ready to use it; sales has neither yet.

- Sales-side equivalent of the analyst agent.
- Decide at that point whether Harman gets a slice of this dash or whether sales output lives entirely in the portal's Offers tab. Currently open, currently blocking nothing.

### X8 — Hardening (was M7)
- Loop hardening, error handling, whatever the previous milestones surfaced.
- Deliberately vague; scope it when the earlier milestones reveal what actually breaks.

### X9 — Instagram + Facebook
**Blocked externally by B1, not by us.**

- Both expose Reels/video watch time, so the X1–X6 pipeline extends without redesign.
- **B1 is permission; X9 is the build.** Clearing B1 does not by itself put a single Instagram row in `content` — the integration still has to be written, and Meta app review may add its own delay. Plan for both.
- Once X9's sync runs, Instagram videos appear on X1's `/analysis` page automatically, because that page is required to be platform-agnostic. No X1 rework.
- Slots in whenever B1 clears, at whatever point that happens to be. If B1 resolves early, X9 can jump the queue — nothing in X2–X8 depends on it either way.

---

## Track B — not code, needs a person

**B1 — Instagram access. IN PROGRESS, started alongside X0.** Blocks X9.

The Facebook Page (645259428673564) sits in a business portfolio owned by the website contractor, and is linked to the wrong IG profile. Resolution: the contractor grants portfolio admin or transfers the Page. Env vars already scoped (META_APP_ID/SECRET/PAGE_ID/IG_USER_ID/ACCESS_TOKEN; System User token recommended).

**Also a standing business risk independent of this project** — someone outside the business controls a Page you depend on. Worth resolving on those grounds alone, even if Instagram analytics never happened.

**B2 — Enrollment reconciliation. Do this DURING or AFTER X3, not before.** Reordered 2026-09-10 (Jas): reconciling against a number you can't see is guesswork; X3's month-by-month view makes the gap concrete and points at which months to investigate.

Stripe shows 15–33 completed enrollments/month against a stated 60/month baseline. E-transfer and manual invoices bypass Checkout entirely, so they are invisible to every number this system produces.

- **Still true before the day-90 review**, regardless of X3's timing — if the review lands first, the gap has to be spoken to whether or not the view exists yet.
- Until it resolves, every enrollment and revenue figure in this system is a floor, not a total. X3 is required to say so on screen.
- Resolution likely means deciding how manual payments get recorded going forward, not just counting the past ones.

**B3 — Hypothesis taxonomy v2 — DROPPED 2026-09-10 (Jas).** Superseded by X1, which produces a richer version of the same thing from Eknoor's per-video descriptions. Consequences, so nothing is silently lost:
- `content.hypothesis` stays NULL and `hypothesis-tags.csv` stays header-only **until X1 ships**. Nothing else will fill them.
- The suggestions agent groups by hypothesis tag — until X1, the Idea map stays mostly "UNTAGGED". Expected, not a bug.
- If the back-catalogue open-coding was already partly done by a team member, that work is now unused. Worth telling them before they spend more time on it.
- **Do not restart a separate taxonomy effort.** If X1 turns out not to fill this need, reopen this decision explicitly rather than quietly running both.

**B4 — Supabase key type. ANSWERED 2026-09-10: still the legacy `eyJ` JWT**, not `sb_secret_`. Checked directly in the Railway `analyst-dash` Variables tab (`SUPABASE_SERVICE_ROLE_KEY`). The StackBlitz-era workaround was never migrated during hosting. Switching to `sb_secret_` is still outstanding — not urgent, but worth doing before it's forgotten entirely.

---

## Scope decisions (locked 2026-09-09/10)

- Platforms live today: **TikTok, YouTube, YouTube Shorts** (Shorts split out from YouTube 2026-09-10, migration 0008 — see X1). Instagram/Facebook arrive at X9. **Code must never hardcode the platform list** — see X1.
- **Videos only.** Photos and carousels dropped.
- Same video on both platforms must be pairable for cross-platform comparison.
- The dash stays a separate app — Option A, "link don't merge." Not rebuilt inside the portal.
- Access is via portal Google login only. No standalone dash password, at all, as of X0.
- Hypothesis tagging comes from X1's structured descriptions, not a separate taxonomy exercise.
- Incomplete figures may be shown, but never unlabelled — see X3 and B2.

## Data reality (verified against repo + DB, 2026-09-09)

- `content`: platform, platformVideoId, title, `hook` (null), `format` (null), `hypothesis` (null — CSV header-only), postedAt. 156 TikTok + 66 YouTube = 222 videos as of 2026-09-10 — **Jas adds videos daily, so this count is a stale snapshot the moment it's written. Never treat a count in this doc as a fact to verify code against.** As of migration 0008, YouTube videos split into `youtube` and `youtube_shorts` by duration (≤60s); the 66 existing YouTube rows were all still labelled plain `youtube` at write time and self-correct on the next nightly sync.
- `performance`: **daily snapshot per video** — views, likes, comments, shares, saves, avgWatchTimeSeconds, retentionPct, followersAtCapture. Snapshots accumulate nightly, so growth over time is derivable.
- **Snapshot history is thin (checked 2026-09-10):** only three capture dates exist — 2026-08-18, 2026-09-09, 2026-09-10. Nothing between Aug 18 and Sep 9 (the nightly-sync outage in `punch-list.md`). So X2's velocity and ad-split figures will read "too new"/"no snapshot" for most videos until the nightly sync has run for a few weeks. Expected, not a bug — the UI must say so rather than show blanks.
- YouTube: watch time + retention present. Shares always 0 (Data API doesn't expose them).
- TikTok: avgWatchTimeSeconds and retentionPct **always null** on the current Display API integration. Not a platform limit — an API-choice limit. X4 fixes it. `sync.ts` has a locked rule against deriving them meanwhile.
- **No ad data anywhere** until X1's manual entry (0 ad runs and 0 ref pairs saved as of 2026-09-10).
- **No enrollment attribution.** Stripe enrollments carry no link to a video, ever.
- **Stripe enrollment counts are a floor, not a total** — see B2.
- `VITE_API_WRITE_TOKEN` is inlined into the client bundle at build time and **must never be set on a hosted build**. As of X0 the dash no longer reads it at all — writes go through the session cookie.
- `Run log` (`/api/logs`) is an engineering debug view. No revenue, no content data.
- KPI tab content was erased 2026-09-10 pending X3. Backend routes untouched.
- Analyst Supabase project (`kmgltqfwtyhswqxjicab`) still authenticates with the legacy `eyJ` service role key — see B4.

## Not in scope
- Photos, carousels, stories
- Enrollment attribution at the video level — no data source exists
- Rebuilding the dash natively inside the portal (Option B) — that stays an M7-era idea, not a plan
- A standalone hypothesis taxonomy exercise — dropped, see B3
