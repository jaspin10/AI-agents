# Portal Integration — LOCKED DECISION: link, don't merge

⚠ This is the single most important decision on this page: **Option A (link, don't merge)** was chosen. The portal gets tabs that open the analyst dashboard in a new browser tab; the two systems stay permanently separate (different repos, different DBs, different stacks, different hosts). **Option C (repo merge) was rejected permanently** — do not revisit this without Jas explicitly reopening it.

Option B (rebuild the analyst panels natively in the portal's plain-CSS/no-TS stack, fetching the Hono API cross-origin) is the possible M7-era upgrade path IF daily use justifies it — not planned now.

## New role: marketing (Eknoor)
Fifth portal role → `profiles_role_check_v4`: `check (role in ('student','teacher','owner','salesman','marketing'))`. Follows the `salesman` pattern exactly: NOT a teacher; `isMarketingOnly` branch in the portal's App.jsx BEFORE phone gate and AccessGate → one-tab shell; excluded from `role='student'` queries so she auto-drops from Students, Meet sweep, Drive groups with zero extra work. (This role lives in the PORTAL repo, not here — see the portal's `access-control-enrollment.md` and `open-bugs.md` bug-report-tab section, which also needs `is_staff()`.)

## ⚠ OPEN DECISION before building auth (blocks Step 5)
Owner + marketing (Eknoor) + salesman (Harman) all see "some of the stuff." Same view for all three, or per-role slices (e.g. Harman sees M6 sales output only, Eknoor sees content analytics only)? Option A can only do all-or-nothing on the dash; per-role slices force Option B panels. **Decide this before Step 5.**

## Build steps (portal-style: one confirmed step at a time)
1. (~30 min, portal repo) Role `marketing`: rebuild check constraint to v4, flip Eknoor's profile. Verify she vanishes from Students/sweeps.
2. (~1 hr, portal repo) App.jsx `isMarketingOnly` branch mirroring `isSalesOnly`; `marketingNav` one-tab shell "Marketing" in AppShell; owner nav gains "Analytics" via `buildTeacherNav()` append (same pattern as Offers). Salesman shell gains the tab only once M6 sales output exists.
3. (~30 min, portal repo) The tab itself — opens the hosted analyst dash URL in a new browser tab (chosen over iframe: no CSP/embedding headaches, honest about being a separate app).
4. (~2–3 hrs, THIS repo) Deploy `apps/api` + `apps/dash` to Railway as fresh GitHub-connected services (⚠ "Upstream Repo/template" mode doesn't read pushed commits — use a normal GitHub-connected service); switch to `sb_secret_` key. **BLOCKED on punch-list.md being closed first** — same Railway project, a healthy cron proves the deploy pattern.
5. (~1–2 hrs, THIS repo) Auth on the dash — simplest viable is a shared-secret header/query checked by the Hono API (same pattern as the portal's `SYNC_SECRET`). Blocked on the per-role visibility decision above.

Total ≈ one focused day, once punch-list.md is closed.

## New env vars when built
Portal needs only the dash URL (constant, not secret). This repo registers its own dash-auth secret in its own env config.
