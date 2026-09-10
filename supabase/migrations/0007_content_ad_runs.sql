-- 0007 · X1 follow-up (locked 2026-09-10, Jas):
-- A video can be ad-boosted more than once over its life (re-run campaigns
-- at different times). The single ad_start_date/ad_end_date/ad_spend_cents
-- columns on content_analysis can only record one run. Replaced with a child
-- table so a video can have any number of runs, each with its own dates and
-- spend. Per-run only — no auto-summed total column; any combined figure is
-- computed at report time (X5), not stored here.
--
-- Already applied to the analyst project (kmgltqfwtyhswqxjicab) via MCP
-- before this branch was pushed — content_analysis had 0 rows at the time.

alter table public.content_analysis
  drop column if exists ad_start_date,
  drop column if exists ad_end_date,
  drop column if exists ad_spend_cents;
-- ad_boosted (tri-state true/false/null) stays on content_analysis as the
-- yes/no/don't-know answer; the runs themselves live in the child table below.

create table if not exists public.content_ad_runs (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references public.content(id) on delete cascade,
  start_date   date,
  end_date     date,
  spend_cents  integer check (spend_cents is null or spend_cents >= 0),
  created_at   timestamptz not null default now(),
  constraint content_ad_runs_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists content_ad_runs_content_idx on public.content_ad_runs (content_id);

alter table public.content_ad_runs enable row level security;
-- service_role bypasses RLS; no anon/authenticated policy on purpose (apps/api is the only writer).
