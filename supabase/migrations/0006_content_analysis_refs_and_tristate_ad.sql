-- 0006 · X1 follow-up (locked 2026-09-10, Jas):
-- 1. A video can have equivalent twins on MORE THAN ONE other platform at once
--    (e.g. a YouTube twin AND an Instagram twin once X9 lands) — the single
--    cross_platform_ref column can't represent that. Replaced with a join
--    table so a video can pair with any number of others.
-- 2. Ad status needs a genuine "don't know" state, not just yes/no — Eknoor
--    should not have to guess when she hasn't checked Ads Manager yet.
--
-- Already applied to the analyst project (kmgltqfwtyhswqxjicab) via MCP
-- before this branch was pushed — content_analysis had 0 rows at the time.

alter table public.content_analysis
  drop constraint if exists content_analysis_no_self_ref;
drop index if exists content_analysis_cross_ref_idx;
alter table public.content_analysis
  drop column if exists cross_platform_ref;

alter table public.content_analysis
  alter column ad_boosted drop not null,
  alter column ad_boosted drop default;
-- ad_boosted is now: true (boosted) / false (not boosted) / null (don't know).

create table if not exists public.content_analysis_refs (
  content_id      uuid not null references public.content(id) on delete cascade,
  ref_content_id  uuid not null references public.content(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (content_id, ref_content_id),
  constraint content_analysis_refs_no_self check (content_id <> ref_content_id)
);

create index if not exists content_analysis_refs_ref_idx on public.content_analysis_refs (ref_content_id);

alter table public.content_analysis_refs enable row level security;
-- service_role bypasses RLS; no anon/authenticated policy on purpose (apps/api is the only writer).
