# Portal Integration — LOCKED DECISION: link, don't merge

⚠ This is the single most important decision on this page: **Option A (link, don't merge)** was chosen. The portal gets tabs that open the analyst dashboard in a new browser tab; the two systems stay permanently separate (different repos, different DBs, different stacks, different hosts). **Option C (repo merge) was rejected permanently** — do not revisit this without Jas explicitly reopening it.

Option B (rebuild the analyst panels natively in the portal's plain-CSS/no-TS stack, fetching the Hono API cross-origin) is the possible M7-era upgrade path IF daily use justifies it — not planned now.

## New role: marketing (Eknoor)
Fifth portal role → `profiles_role_check_v4`: `check (role in ('student','teacher','owner','salesman','marketing'))`. Follows the `salesman` pattern exactly: NOT a teacher; `isMarketingOnly` branch in the portal's App.jsx BEFORE phone gate and AccessGate → one-tab shell; excluded from `role='student'` queries so she auto-drops from Students, Meet sweep, Drive groups with zero extra work. (This role lives in the PORTAL repo, not here — see the portal's `access-control-enrollment.md` and `open-bugs.md` bug-report-tab section, which also needs `is_staff()`.)

Live as of 2026-09-09: constraint v4 applied, Eknoor Sadhra (`www.eknooor919@gmail.com`) is `role='marketing'`.

## Per-role visibility — partially resolved
The dash itself now has a locked answer: two HTTP Basic passwords, `owner` (everything) and `marketing` (Analysis/Suggestions/Idea map/Performance — no revenue, no Run log), enforced server-side by username. See `content-analysis.md` X1. That covers Eknoor.

**Still open:** whether Harman (salesman) ever gets a slice of this dash, or whether M6 sales output stays purely inside the portal's Offers tab and never touches the analyst dash at all. Not urgent — nothing is currently blocked on it.

## Build steps (portal-style: one confirmed step at a time)
1. **DONE (2026-09-09)** (portal repo) Role `marketing`: check constraint rebuilt to v4, Eknoor's profile flipped. Verified she no longer matches `role='student'`, so she drops out of Students/sweeps.
2. **DONE (2026-09-09)** (portal repo) App.jsx `isMarketingOnly` branch mirroring `isSalesOnly`; `marketingNav` one-tab shell "Marketing" in AppShell; owner nav gains "Analytics" via `buildTeacherNav()` append (same pattern as Offers). Merged as portal PR #6. Salesman shell gains the tab only once M6 sales output exists. Ships with a placeholder `src/pages/Analytics.jsx`, since there is no hosted dash URL yet.
3. **NOT STARTED — now unblocked.** (~30 min, portal repo) The tab itself — replace the Analytics placeholder body so it opens the hosted analyst dash URL in a new browser tab. The URL exists as of Step 4 below. Needs a real decision on which credentials to hand the owner (see note under Step 4) — simplest is the tab just opens the URL and the owner logs in with Basic auth once, same as any bookmark.
4. **DONE (2026-09-09).** Deployed as ONE Railway service, not the two originally planned — see `content-analysis.md` for why (`apps/dash` had no production build, relative-path fetches, no CORS story). `apps/api` now serves the built `apps/dash` from the same origin. Service `analyst-dash` in project `perfect-truth`, live at `https://analyst-dash-production.up.railway.app`. Gated by HTTP Basic (`owner` / `DASH_PASSWORD` env var) so the public URL doesn't expose revenue and content data. This interim password IS the "auth on the dash" that Step 5 originally scoped — see below.
5. **Superseded by X1, not a separate step anymore.** The original plan was a shared-secret header/query for API calls, mirroring the portal's `SYNC_SECRET`. What actually shipped instead is direct HTTP Basic on the whole dash (Step 4), with the `marketing`-vs-`owner` split specified as part of `content-analysis.md` X1. X1 is the real remaining work: right now there is only the `owner` password: `marketing` login and its server-side route restrictions do not exist yet.

## Remaining work, plainly
- **Step 3** (~30 min, portal repo): wire the Analytics tab to the live URL. Nothing blocks this now.
- **X1** (AI-agents repo, scoped in `content-analysis.md`): build the `marketing` password and its server-side gating, plus the Analysis page itself. Until X1 ships, Eknoor has no login of her own.

## New env vars when built
Portal needs only the dash URL (constant, not secret) once Step 3 is built. This repo already holds its own `DASH_PASSWORD` / `DASH_USER` in Railway.
