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
2. Clicking the Analytics tab calls the **`dash-token` Supabase Edge Function** in the portal's project. (Correction to the first draft: this is a fourth function beside `smart-handler`, `sync-recordings` and `sync-enrollments`, deployed the same way — not new infra.) The function checks the caller's real portal session — `auth.getUser` on the bearer, which can't be faked — looks up their `profiles.role`, and mints a short-lived signed token carrying that role. Only `owner` and `marketing` are minted one; every other role gets `403 no_access` and no token exists.
3. Portal opens the returned URL, `DASH_URL/auth/handoff?token=…`, in a new tab.
4. `apps/api` on the dash verifies the token's signature against a shared secret, checks the claims, burns the `jti`, and sets its own httpOnly session cookie. **The dash never queries the portal's database directly** — it only trusts a signed note, so the two Supabase projects stay genuinely separate, in the spirit of Option A.
5. `apps/api` gates every route by the role in that cookie.
6. HTTP Basic (`DASH_USER` / `DASH_PASSWORD`) is removed once this is verified end to end.

**Why an Edge Function, not the dash reading the portal's DB directly:** keeps the signing secret server-side (never shipped to a browser — the exact mistake `VITE_API_WRITE_TOKEN` warns about), and avoids handing the analyst app a credential into a database that was deliberately kept separate.

**Pieces (built 2026-09-10, in PR):**
- Portal repo: `supabase/functions/dash-token/index.ts`. Plus `src/pages/Analytics.jsx`, now "call the function, open the URL in a new tab" (tab is opened synchronously in the click so popup blockers allow it, then pointed at the URL once the token arrives).
- Analyst repo (`apps/api/src/index.ts`): handoff + session-cookie auth replacing Basic Auth; `apps/dash/src/App.tsx` draws panels by role via new `GET /api/me`; `apps/dash/src/api.ts` drops the `VITE_API_WRITE_TOKEN` bearer and bounces to the portal on 401.
- A shared signing secret `DASH_TOKEN_SECRET`, in both the portal's Edge Function secrets and Railway.

**Sub-decisions — LOCKED 2026-09-10 (Jas):**
- Handoff token lifetime **60 seconds, single use**. `apps/api` exchanges it for its own cookie so nobody is re-verified per click.
- Session cookie **12 hours** (`dash_session`, httpOnly, SameSite=Lax, Secure on Railway). When it expires, click Analytics in the portal again.
- Dash URL with no token and no cookie → **302 to the portal login, no message, no form**. `/api/*` → `401` JSON.
- Transition only: `GET /auth/basic` accepts the old `DASH_USER`/`DASH_PASSWORD` and issues the same cookie as owner, so Jas has a way in if the handoff breaks. Nothing else on the public surface ever issues a Basic challenge. It is deleted with `DASH_PASSWORD`.
- Harman (salesman) is out of scope until X7 — the function refuses to mint for him.

## Integration steps — history
1. **DONE (2026-09-09)** (portal repo) Role `marketing`: constraint rebuilt to v4, Eknoor's profile flipped. Verified she no longer matches `role='student'`.
2. **DONE (2026-09-09)** (portal repo) App.jsx `isMarketingOnly` branch mirroring `isSalesOnly`; `marketingNav` one-tab shell in AppShell; owner nav gains "Analytics". Portal PR #6. Ships with a placeholder `src/pages/Analytics.jsx`.
3. **Now part of X0.** Wire the Analytics tab to the dash via the token handoff above.
4. **DONE (2026-09-09).** Deployed as ONE Railway service (`apps/api` serves built `apps/dash`), not the two originally planned — `apps/dash` had no production build, used relative-path fetches, and had no CORS story. Live at `https://analyst-dash-production.up.railway.app`. Currently HTTP Basic; replaced by X0.
5. **Now part of X0.** The original shared-secret plan is replaced by the portal-Google-token design above.

## Env vars for X0
Portal's Supabase project (Edge Function secrets): `DASH_TOKEN_SECRET` (32+ chars), `DASH_URL` (optional; defaults to the Railway service URL). Railway `analyst-dash`: the same `DASH_TOKEN_SECRET`, plus `PORTAL_URL` (optional; defaults to `https://portal.frenchwithjas.ca/analytics`). Portal's client code needs no new secret — it calls its own project's Edge Function, already authenticated. Local `apps/api` dev: `DASH_DEV_ROLE=owner|marketing` in `.env` (ignored on Railway).
