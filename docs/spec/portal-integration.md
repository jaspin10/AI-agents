# Portal Integration — LOCKED DECISION: link, don't merge

⚠ This is the single most important decision on this page: **Option A (link, don't merge)** was chosen. The portal gets tabs that open the analyst dashboard in a new browser tab; the two systems stay permanently separate (different repos, different DBs, different stacks, different hosts). **Option C (repo merge) was rejected permanently** — do not revisit this without Jas explicitly reopening it.

Option B (rebuild the analyst panels natively in the portal's plain-CSS/no-TS stack, fetching the Hono API cross-origin) is the possible M7-era upgrade path IF daily use justifies it — not planned now.

## New role: marketing (Eknoor)
Fifth portal role → `profiles_role_check_v4`: `check (role in ('student','teacher','owner','salesman','marketing'))`. Follows the `salesman` pattern exactly: NOT a teacher; `isMarketingOnly` branch in the portal's App.jsx BEFORE phone gate and AccessGate → one-tab shell; excluded from `role='student'` queries so she auto-drops from Students, Meet sweep, Drive groups with zero extra work. (This role lives in the PORTAL repo, not here — see the portal's `access-control-enrollment.md` and `open-bugs.md` bug-report-tab section, which also needs `is_staff()`.)

Live as of 2026-09-09: constraint v4 applied, Eknoor Sadhra (`www.eknooor919@gmail.com`) is `role='marketing'`.

## Auth — LOCKED DECISION 2026-09-10: Google via the portal, no dash login

**Supersedes** the interim HTTP Basic gate (still live and working today — nothing breaks until this ships) and the X1 two-password plan in `content-analysis.md`. Jas confirmed 2026-09-10: the dash gets **no login of its own, and no direct Railway URL access, ever.** The only way in is by clicking the tab from inside the portal, already logged in with Google.

**Why this is better than a second password:** no credential to hand Eknoor or rotate; the dash trusts the portal's own "is this really them" check instead of a guessable string; the owner/marketing split comes for free from `profiles.role`, already sitting in the portal DB.

**How it works:**
1. Person is logged into the portal via Google (existing flow, unchanged).
2. Clicking the Analytics tab calls a **Supabase Edge Function** in the portal's project (kind of infra not currently in this project — new). The function checks the caller's real portal session — this can't be faked, it's Supabase's own auth check — looks up their `profiles.role`, and mints a short-lived signed token carrying that role.
3. Portal opens `DASH_URL?token=...` in a new tab (Step 3, Option A — unchanged, just the URL now carries a token instead of being bare).
4. `apps/api` on the dash verifies the token's signature against a shared secret and reads the role claim. **The dash never queries the portal's database directly** — it only trusts a signed note, so the two Supabase projects stay genuinely separate, in the spirit of Option A's "different DBs."
5. `apps/api` gates every route by that role (owner vs marketing) — this is the server-side enforcement X1 already called for, just driven by the token's role claim instead of a Basic Auth username.
6. HTTP Basic (`DASH_USER` / `DASH_PASSWORD`) is removed once this ships.

**Why an Edge Function, not the dash reading the portal's DB directly:** keeps the signing secret server-side (never shipped to a browser — the exact mistake `VITE_API_WRITE_TOKEN` warns about elsewhere in these specs), and avoids handing the analyst app a credential into a database that was deliberately kept separate.

**New pieces needed (none exist yet):**
- Portal repo: a Supabase Edge Function that mints the token — nothing is currently deployed to this project's Edge Functions. Step 3's tab-click logic changes from a bare `window.open(DASH_URL)` to "call the function, then open the URL with the token."
- Analyst repo (`apps/api`): token-verification middleware replacing the Basic Auth middleware.
- A shared signing secret, set in both the portal's Supabase Edge Function secrets and the analyst app's Railway env.

**Open sub-decisions for the build session (not yet decided):**
- Token lifetime — recommend a short handoff token (~60s, just long enough to survive the redirect) that `apps/api` exchanges for its own session cookie, so the person isn't re-verified on every click inside the dash.
- Harman (salesman) is out of scope for this — only owner/marketing roles matter until the dash has anything built for him.

**Status: decided, not built.** The current HTTP Basic password keeps working until this ships — no outage in the meantime.

## Build steps (portal-style: one confirmed step at a time)
1. **DONE (2026-09-09)** (portal repo) Role `marketing`: check constraint rebuilt to v4, Eknoor's profile flipped. Verified she no longer matches `role='student'`, so she drops out of Students/sweeps.
2. **DONE (2026-09-09)** (portal repo) App.jsx `isMarketingOnly` branch mirroring `isSalesOnly`; `marketingNav` one-tab shell "Marketing" in AppShell; owner nav gains "Analytics" via `buildTeacherNav()` append (same pattern as Offers). Merged as portal PR #6. Ships with a placeholder `src/pages/Analytics.jsx`.
3. **NOT STARTED — scope changed 2026-09-10.** Was: open the dash URL bare in a new tab. Now: call the new Edge Function for a token, then open `DASH_URL?token=...`. See Auth section above. Needs the Edge Function (new infra) to exist first.
4. **DONE (2026-09-09).** Deployed as ONE Railway service (`apps/api` serves built `apps/dash`), not the two originally planned — see `content-analysis.md` for why. Live at `https://analyst-dash-production.up.railway.app`. Currently gated by HTTP Basic; being replaced per the Auth section above.
5. **Superseded — see Auth section above.** The original shared-secret plan and the X1 two-password plan are both replaced by the portal-Google-token design.

## New env vars when built
Portal's Supabase project: the Edge Function's signing secret. Analyst app (Railway): the same signing secret, to verify tokens. Portal's client code needs no new secret — it calls its own project's Edge Function, already authenticated.
