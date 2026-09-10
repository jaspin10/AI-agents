# Portal Integration — LOCKED DECISION: link, don't merge

⚠ This is the single most important decision on this page: **Option A (link, don't merge)** was chosen. The portal gets tabs that open the analyst dashboard in a new browser tab; the two systems stay permanently separate (different repos, different DBs, different stacks, different hosts). **Option C (repo merge) was rejected permanently** — do not revisit this without Jas explicitly reopening it.

Option B (rebuild the analyst panels natively in the portal's plain-CSS/no-TS stack, fetching the Hono API cross-origin) is the possible X8-era upgrade path IF daily use justifies it — not planned now.

**The forward plan lives in `x-series.md`.** This file holds the integration decisions and the auth design; the build order is there. What this file calls Steps 1–5 is history — Steps 1, 2 and 4 are done, and Steps 3 and 5 are together X0 in `x-series.md`.

## New role: marketing (Eknoor)
Fifth portal role → `profiles_role_check_v4`: `check (role in ('student','teacher','owner','salesman','marketing'))`. Follows the `salesman` pattern exactly: NOT a teacher; `isMarketingOnly` branch in the portal's App.jsx BEFORE phone gate and AccessGate → one-tab shell; excluded from `role='student'` queries so she auto-drops from Students, Meet sweep, Drive groups with zero extra work. (This role lives in the PORTAL repo — see the portal's `access-control-enrollment.md` and `open-bugs.md` bug-report-tab section, which also needs `is_staff()`.)

Live as of 2026-09-09: constraint v4 applied, Eknoor Sadhra (`www.eknooor919@gmail.com`) is `role='marketing'`.

## Auth — LOCKED DECISION 2026-09-10: Google via the portal, no dash login

**This is X0 in `x-series.md`.** Supersedes the interim HTTP Basic gate (still live and working — nothing breaks until this ships). Jas confirmed 2026-09-10: the dash gets **no login of its own, and no direct Railway URL access, ever.** The only way in is by clicking the tab from inside the portal, already logged in with Google.

**Why this beats a second password:** no credential to hand Eknoor or rotate; the dash trusts the portal's own "is this really them" check instead of a guessable string; the owner/marketing split comes for free from `profiles.role`, already in the portal DB.

**How it works:**
1. Person is logged into the portal via Google (existing flow, unchanged).
2. Clicking the Analytics tab calls a **Supabase Edge Function** in the portal's project (new infra — nothing is deployed there today). The function checks the caller's real portal session — this can't be faked, it's Supabase's own auth check — looks up their `profiles.role`, and mints a short-lived signed token carrying that role.
3. Portal opens `DASH_URL?token=…` in a new tab.
4. `apps/api` on the dash verifies the token's signature against a shared secret and reads the role claim. **The dash never queries the portal's database directly** — it only trusts a signed note, so the two Supabase projects stay genuinely separate, in the spirit of Option A.
5. `apps/api` gates every route by that role.
6. HTTP Basic (`DASH_USER` / `DASH_PASSWORD`) is removed once this ships.

**Why an Edge Function, not the dash reading the portal's DB directly:** keeps the signing secret server-side (never shipped to a browser — the exact mistake `VITE_API_WRITE_TOKEN` warns about), and avoids handing the analyst app a credential into a database that was deliberately kept separate.

**New pieces needed (none exist yet):**
- Portal repo: the Edge Function. Plus `src/pages/Analytics.jsx` changes from a placeholder to "call the function, then open the URL with the token."
- Analyst repo (`apps/api`): token-verification middleware replacing Basic Auth.
- A shared signing secret, in both the portal's Edge Function secrets and Railway.

**Open sub-decisions for the build session:**
- Token lifetime — recommend a short handoff token (~60s, just long enough to survive the redirect) that `apps/api` exchanges for its own session cookie, so the person isn't re-verified on every click inside the dash.
- Harman (salesman) is out of scope until X7.

## Integration steps — history
1. **DONE (2026-09-09)** (portal repo) Role `marketing`: constraint rebuilt to v4, Eknoor's profile flipped. Verified she no longer matches `role='student'`.
2. **DONE (2026-09-09)** (portal repo) App.jsx `isMarketingOnly` branch mirroring `isSalesOnly`; `marketingNav` one-tab shell in AppShell; owner nav gains "Analytics". Portal PR #6. Ships with a placeholder `src/pages/Analytics.jsx`.
3. **Now part of X0.** Wire the Analytics tab to the dash via the token handoff above.
4. **DONE (2026-09-09).** Deployed as ONE Railway service (`apps/api` serves built `apps/dash`), not the two originally planned — `apps/dash` had no production build, used relative-path fetches, and had no CORS story. Live at `https://analyst-dash-production.up.railway.app`. Currently HTTP Basic; replaced by X0.
5. **Now part of X0.** The original shared-secret plan is replaced by the portal-Google-token design above.

## New env vars when built
Portal's Supabase project: the Edge Function's signing secret. Railway: the same signing secret, to verify tokens. Portal's client code needs no new secret — it calls its own project's Edge Function, already authenticated.
