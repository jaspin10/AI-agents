-- 0005 · X1 Eknoor content analysis (docs/spec/x-series.md, X1)
-- One row per content row. All classification columns are plain text on
-- purpose (locked 2026-09-10): idea_source is free text with quick-pick
-- chips derived from DISTINCT values; format / cta_type are UI dropdowns
-- with an Other escape. No CHECK enums — a new value must never need a
-- migration or a deploy. Platform-agnostic: nothing here mentions a platform.
-- idea_source is NULL on every pre-X1 video forever — there is no backfill.

create table if not exists public.content_analysis (
  content_id          uuid primary key references public.content(id) on delete cascade,
  description         text,
  hook_text           text,
  format              text,
  has_model           boolean,
  has_cta             boolean,
  cta_type            text,
  ad_boosted          boolean not null default false,
  ad_start_date       date,
  ad_end_date         date,
  ad_spend_cents      integer check (ad_spend_cents is null or ad_spend_cents >= 0),
  cross_platform_ref  uuid references public.content(id) on delete set null,
  idea_source         text,
  analysed_by         text not null,
  analysed_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  constraint content_analysis_ad_dates check (ad_end_date is null or ad_start_date is null or ad_end_date >= ad_start_date),
  constraint content_analysis_no_self_ref check (cross_platform_ref is null or cross_platform_ref <> content_id)
);

create index if not exists content_analysis_idea_source_idx on public.content_analysis (idea_source);
create index if not exists content_analysis_cross_ref_idx on public.content_analysis (cross_platform_ref);

alter table public.content_analysis enable row level security;
-- service_role bypasses RLS; no anon/authenticated policy on purpose (apps/api is the only writer).
