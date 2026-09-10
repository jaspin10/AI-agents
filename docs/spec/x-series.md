# The X-series — one plan for marketing + sales

Status as of 2026-09-10. **This is the single plan.** Everything previously scattered across `content-analysis.md`, the M4.5 "open items from 4.5" list, and the M6/M7 placeholders is consolidated here, ordered by what has to happen first.

Milestones are prefixed X to keep them apart from the historical M-series (M1–M5 describe what was already built; they are history, not a plan).

**Renumbering note:** the 2026-09-09 draft numbered content analysis as X1. Auth turned out to block it, so auth became X0 and the rest shifted. Old X1→new X1 (unchanged), old X2→X2, old X3→X4, old X4→X5, old X5→X6, old X6→X9.

---

## Where things actually stand

Built and live: the analyst pipeline (TikTok + YouTube + Stripe sync, nightly at 07:00 UTC), the suggestions agent with its two unskippable safety checks, Slack delivery, and the hosted dashboard at `analyst-dash-production.up.railway.app`.

Not built: everything below.

The dashboard currently sits behind one interim HTTP Basic password with no role distinction. **Only Jas can use it.** Nobody else can be given access until X0 ships — that is why X0 is first.

**Build order confirmed by Jas 2026-09-10: X0 first.**

**Start B1 now, in parallel.** It is the only item whose timeline depends on someone outside the business, so the clock starts when the ask is made, not when the code is ready. See Track B.

---

## Track A — code, in order

### X0 — Access: portal Google login → dash
**Why first:** Eknoor cannot be given the dashboard at all until this exists. Every other milestone is work she can't reach. Also removes a static password currently guarding revenue data on a public URL.

- Portal repo: a Supabase Edge Function that checks the caller's real portal session, reads `profiles.role`, and mints a short-lived signed token. **New infra — nothing is deployed to that project's Edge Functions today.**
- Portal repo: `src/pages/Analytics.jsx` (currently a placeholder) calls that function, then opens `DASH_URL?token=…` in a new tab. This is integration Step 3.
- Analyst repo: `apps/api` verifies the token signature against a shared secret, reads the role claim, and gates every route by role. Replaces the Basic Auth middleware.
- Shared signing secret in both Railway and the portal's Edge Function secrets.
- **Locked:** no standalone dash login, no direct Railway URL access ever. Portal is the only door.
- **Do not remove `DASH_PASSWORD` until the new path is verified working end to end** — it's the fallback if the handoff breaks.
- While in that service's env, resolve B4 below (report key TYPE only, never the key itself).
- Design detail in `portal-integration.md`'s Auth section.

**Role permissions (locked, mechanism-independent):**
- `owner` — everything.
- `marketing` — Analysis, Suggestions, Idea map, Performance. **No revenue anywhere.** No Run log.
- `salesman` — nothing on this dash yet; revisit at X7.

### X1 — Eknoor inputs content analysis
**Why second:** it is the only milestone that produces genuinely new information rather than rearranging what exists. X6 cannot learn anything without it, and it takes human time to fill, so starting it early means the data is ready when the agent is.

**X1 is also the replacement for the old hypothesis-taxonomy effort** (dropped 2026-09-10, see Track B history). `content.hypothesis` gets populated from Eknoor's structured descriptions rather than from a separate hand-built taxonomy — so the mapping onto `content.hook` / `.format` / `.hypothesis` below is not a nice-to-have, it is now the only path by which those columns ever get filled. Treat it as required scope, not an optional extra.

- New table `content_analysis`, one row per content row: description (free text), hook_text, format, has_model, has_cta, cta_type, ad_boosted, ad_start_date, ad_end_date, ad_spend_cents, cross_platform_ref (paired video on the other platform), analysed_by, analysed_at.
- `/analysis` page in `apps/dash`: every TikTok + YouTube video with title, posted date, latest views/likes/comments/shares, YouTube watch time where present, and a per-video form.
- `/api/analysis/*` read + write routes, authenticated by whatever session X0 establishes — never by a baked-in `VITE_` token.
- **Required:** map the structured fields onto `content.hook` / `.format` / `.hypothesis`, so the existing suggestions agent benefits and the tagging gap closes.
- **Ad data is manual entry here.** A true paid/organic split needs X4.

### X2 — Derived metrics
**Why third:** pure computation over data that already exists plus X1's fields. No external dependencies, no approvals, nothing can block it.

- comment rate, share rate, engagement rate (as % of views)
- view velocity: views at day 1 / 7 / 30 from snapshot history
- follower-normalised views (views ÷ followersAtCapture at post time)
- cross-platform side-by-side for paired videos
- before/after-ad view split from snapshots + X1's manual ad dates — **a time split, not a true paid/organic split. Label it as such wherever it appears.**
- **Decide here:** `performance.content_id` holds platform-native video ids, not content UUIDs (the M4.5 bug). Every join must go through `content.platformVideoId`. X2 does the heaviest joining in the project — either migrate to a real UUID FK now or amend the stale schema comment in `performance.ts` and move on. Don't leave it ambiguous for a third milestone.

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
- Ads APIs (TikTok Marketing, Google Ads) only if spend grows enough to justify separate app approvals. Not before.

### X6 — Agent correlation + the closed loop
**Depends on X1 having real volume — roughly 50 analysed videos. Can start before X4/X5.**

- New agent task: read `content_analysis` + performance + X2's derived metrics, output what works and what doesn't, with the evidence for each claim.
- Auto-suggest `hypothesis` tags from Eknoor's descriptions.
- **Idea map edges** (carried over from the M4.5 open list): draw suggestion → source videos → outcome, so the map shows whether an idea actually worked. Belongs here — the data to draw those edges is exactly what this milestone produces.
- **Standing caution:** 221 videos with ad-spend confounds is enough for patterns, not proof. Outputs are hypotheses to test, never conclusions. Anything touching enrollments is time-correlation only — Stripe carries no link to a video, and no amount of analysis creates one. If B2 is still unresolved, that caution is stronger, not weaker: the enrollment denominator itself is incomplete.

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
- Slots in whenever B1 clears, at whatever point that happens to be. If B1 resolves early, X9 can jump the queue — nothing in X2–X8 depends on it either way.

---

## Track B — not code, needs a person

**B1 — Instagram access. START NOW, in parallel with X0.** Blocks X9.

The Facebook Page (645259428673564) sits in a business portfolio owned by the website contractor, and is linked to the wrong IG profile. Resolution: the contractor grants portfolio admin or transfers the Page. Env vars already scoped (META_APP_ID/SECRET/PAGE_ID/IG_USER_ID/ACCESS_TOKEN; System User token recommended).

**Why start now rather than when X9 comes up:** this is the one item where the timeline belongs to somebody else. A contractor may take days or weeks to respond, or may have left, or may want something in return. Making the ask early costs nothing and means X9 is unblocked whenever the code gets there, instead of the code waiting on a conversation that hadn't started.

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

**B4 — Supabase key type.** Switch the analyst project to an `sb_secret_` key; the legacy `eyJ` JWT was a StackBlitz workaround. Unverified whether this happened during hosting. **Folded into X0**, which already touches that service's env.

---

## Scope decisions (locked 2026-09-09/10)

- Platforms: **TikTok + YouTube only** until X9.
- **Videos only.** Photos and carousels dropped.
- Same video on both platforms must be pairable for cross-platform comparison.
- The dash stays a separate app — Option A, "link don't merge." Not rebuilt inside the portal.
- Access is via portal Google login only. No standalone dash password after X0.
- Hypothesis tagging comes from X1's structured descriptions, not a separate taxonomy exercise.
- Incomplete figures may be shown, but never unlabelled — see X3 and B2.

## Data reality (verified against repo + DB, 2026-09-09)

- `content`: platform, platformVideoId, title, `hook` (null), `format` (null), `hypothesis` (null — CSV header-only), postedAt. 155 TikTok + 66 YouTube = 221 videos.
- `performance`: **daily snapshot per video** — views, likes, comments, shares, saves, avgWatchTimeSeconds, retentionPct, followersAtCapture. Snapshots accumulate nightly, so growth over time is derivable.
- YouTube: watch time + retention present. Shares always 0 (Data API doesn't expose them).
- TikTok: avgWatchTimeSeconds and retentionPct **always null** on the current Display API integration. Not a platform limit — an API-choice limit. X4 fixes it. `sync.ts` has a locked rule against deriving them meanwhile.
- **No ad data anywhere** until X1's manual entry.
- **No enrollment attribution.** Stripe enrollments carry no link to a video, ever.
- **Stripe enrollment counts are a floor, not a total** — see B2.
- `VITE_API_WRITE_TOKEN` is inlined into the client bundle at build time and **must never be set on a hosted build**.
- `Run log` (`/api/logs`) is an engineering debug view. No revenue, no content data.
- KPI tab content was erased 2026-09-10 pending X3. Backend routes untouched.

## Not in scope
- Photos, carousels, stories
- Enrollment attribution at the video level — no data source exists
- Rebuilding the dash natively inside the portal (Option B) — that stays an M7-era idea, not a plan
- A standalone hypothesis taxonomy exercise — dropped, see B3
