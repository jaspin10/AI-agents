# Content Analysis — the X-series

Status: **scoped, nothing built.** Decided 2026-09-09. Milestones are prefixed X to keep them apart from the platform's M-series.

## Purpose

Close the loop between creative choices and outcomes. Eknoor (marketing) watches each video and writes a structured description — who was in it, the hook, what was explained, whether there was a CTA. The AI agent then correlates those human descriptions against performance data to learn which creative choices drive views, retention and (loosely) enrollments. Eknoor supplies the qualitative layer; the agent supplies the correlation. Neither can do the other's job.

## Scope decisions (locked 2026-09-09)

- Platforms: **TikTok + YouTube only** for now. Instagram/Facebook deferred until Meta Business verification clears (X6).
- **Videos only.** Photos and carousels dropped.
- Same video posted to both platforms must be **pairable**, so cross-platform comparison is possible.
- Ad data starts as **manual entry** by Eknoor. True paid/organic split arrives with the TikTok Business API (X3).
- Lives inside the hosted dash (`apps/api` serving `apps/dash`, single origin, HTTP Basic) — see `portal-integration.md`. Not a portal page.

## What exists today (verified against repo + DB, 2026-09-09)

- `content` rows: platform, platformVideoId, title, `hook` (always null), `format` (always null), `hypothesis` (from CSV — currently 0 loaded), postedAt. 155 TikTok + 66 YouTube = 221 videos.
- `performance` rows: **daily snapshot per video** — views, likes, comments, shares, saves, avgWatchTimeSeconds, retentionPct, followersAtCapture. Snapshots accumulate from the nightly sync, so view growth over time is derivable.
- YouTube: watch time + retention populated via the Analytics API. Shares always 0 (Data API does not expose).
- TikTok: avgWatchTimeSeconds and retentionPct **always null** — the Display API does not expose them, and `sync.ts` has a locked rule against deriving them.
- **No ad data anywhere.** No spend, no boosted flag, no paid/organic split.
- **No enrollment attribution.** Stripe enrollments carry no link to a video. Any "what drives enrollments" answer is time-correlation only. Say so in every output that touches it.
- Write path: `POST /api/suggestions/:id/status` uses a bearer `API_WRITE_TOKEN`. The dash's `VITE_API_WRITE_TOKEN` is baked into the client bundle at build time and **must never be set on a hosted build**.
- Current dash (`apps/dash/src/App.tsx`) is a single-page client with five sidebar tabs — Suggestions, Idea map, Performance, KPIs, Run log — switched by local React state, not routes. One HTTP Basic password currently gates the whole bundle and every `/api/*` route beneath it; there is no per-route authorization by username yet.
- `Run log` (`/api/logs`) is an engineering debug view — every agent tool call, status, duration, error — with no revenue or content data in it.
- **`KPIs` (`/api/kpis` + `/api/kpis/monthly`) shows revenue directly.** `Kpis.tsx`'s monthly breakdown table renders a `Revenue` column in dollars (`revenueCents` from Stripe-visible enrollments) alongside enrollments, videos posted, tagged count, and suggestion counts. Revenue is not separable from the rest of that endpoint's response without a new endpoint — the two are fetched and rendered together.

## Correction to a prior belief

TikTok watch time is NOT unavailable. The **Business / Insights API** (a different API from the Display API the sync currently uses) exposes `average_time_watched`, `total_time_watched`, `full_video_watched_rate`, `video_duration`, `reach`, and `impression_sources`. The last one breaks views down by source, which is a paid-vs-organic split without any Ads API. Verify against current TikTok developer docs before X3; migration cost is unknown.

## Milestones

### X1 — Eknoor inputs data (first, unblocked)
Goal: a page Eknoor can use on day one to describe videos, with the existing metrics beside each one.

- New table `content_analysis` (one row per content row): description (free text), hook_text, format, has_model, has_cta, cta_type, ad_boosted, ad_start_date, ad_end_date, ad_spend_cents, cross_platform_ref (the paired content id on the other platform), analysed_by, analysed_at.
- Page lists every TikTok + YouTube video with title, posted date, latest views/likes/comments/shares, and YouTube watch time where present. Per-video form for the fields above.
- **Write path:** analysis writes authenticate via the HTTP Basic session already on every request — NOT via a baked-in `VITE_` token. This is the fix for the write-token problem for these routes.

**Visibility decision — LOCKED 2026-09-09 (Jas confirmed):**
- Two Basic-auth users: `owner` and `marketing`. Role = which password.
- Enforcement is **server-side, by authenticated username, inside `apps/api`** — not just hiding sidebar buttons in the client. The whole `apps/dash` bundle is one JS file today; hiding a nav button does not stop a request straight to an API route. Every route handler must check which username authenticated and refuse `marketing` where it doesn't belong, same enforcement style as the existing `API_WRITE_TOKEN` check.
- `marketing` password gets: the new `/analysis` page and its data (video list + metrics + the `content_analysis` fields), Suggestions, Idea map, Performance. **No revenue, anywhere.**
- `marketing` password does NOT get: Run log (agent debug view, not marketing-relevant) or KPIs (revenue is embedded in its response and not separable without a new endpoint — see above).
- If a revenue-free KPI view (enrollment count, videos posted, tagged count, suggestion counts — no dollar figures) is wanted for marketing later, that is a new endpoint, not a reuse of `/api/kpis/monthly`. Not in X1 scope; note it as a possible X1.5 if Jas wants it.
- `owner` password keeps everything, unchanged.
- This is a pragmatic answer to `portal-integration.md`'s open per-role question, scoped to this dash — it does not resolve that question for the portal tab itself.
- Map the structured fields onto the existing `hook` / `format` / `hypothesis` columns on `content` where they fit, so the current suggestions loop benefits immediately.

### X2 — Derived metrics
Computed from what already exists, no new integrations.

- comment rate, share rate, engagement rate (as % of views)
- view velocity: views at day 1 / 7 / 30 from snapshot history
- follower-normalised views (views ÷ followersAtCapture at post time)
- cross-platform side-by-side for paired videos
- before/after-ad view split derived from snapshots + X1's manual ad dates (a time split, not a true paid/organic split — label it as such)

### X3 — TikTok Business API migration
- Replace/augment `packages/integrations/src/tiktok/` Display API calls with Business/Insights API.
- Unlocks watch time, completion rate, reach, impression_sources for TikTok.
- Prerequisites: TikTok Business account, new app registration and approval, new OAuth scopes. Non-trivial; scope it before starting.
- The "never derive retention" rule stays — this fetches real values.

### X4 — Ad analytics
- Paid/organic split from impression_sources (needs X3).
- Cost per view, cost per enrollment-in-window from X1's spend entries.
- Ads APIs (TikTok Marketing, Google Ads) only if spend grows enough to justify separate app approvals.

### X5 — Agent correlation
- A new agent task: read `content_analysis` + performance + derived metrics, output what works and what doesn't, with the evidence for each claim.
- Auto-suggest `hypothesis` tags from Eknoor's descriptions.
- Feed findings into the existing suggestions loop.
- Standing caution: 221 videos with ad-spend confounds is enough for patterns, not proof. Outputs are hypotheses to test, not conclusions.

### X6 — Instagram + Facebook
- Blocked on Meta Business portfolio verification.
- Both expose Reels/video watch time, so the X1–X5 pipeline extends without redesign.

## Order and dependencies

X1 → X2 (pure computation on X1 + existing data) → X3 (migration) → X4 (needs X3) → X5 (needs X1 data volume; can start once ~50 videos are analysed) → X6 (external blocker).

X5 can overlap X3/X4 — it does not need TikTok watch time to start producing value from YouTube data plus Eknoor's descriptions.

## Not in scope
- Photos, carousels, stories
- Enrollment attribution at the video level (no data source exists)
- Rebuilding any of this natively in the portal (Option B) — stays in the hosted dash
