-- 0011 · X6 agent correlation + the closed loop (docs/spec/x-series.md, X6)
--
-- Two tables, both service_role-only like every X1/X2 table:
--
-- insight_runs — one row per run of the insights agent (nightly, chained at
--   the end of sync.js, or manual from the dash). `report` is the full JSON
--   the agent produced: per-platform claims with evidence video ids, pair
--   evidence, idea-map edges, the LLM narrative, and the standing caution.
--   The caution lives INSIDE the payload on purpose (locked 2026-09-10) so
--   any renderer that shows the numbers carries it too.
--
-- hypothesis_suggestions — tags the LLM proposed from Eknoor's free-text
--   descriptions. SUGGEST-ONLY (locked 2026-09-10): nothing here touches
--   content.hypothesis until a person approves it in the dash. One row per
--   (content_id, tag); a later run re-proposing the same tag is a no-op, so a
--   rejected tag stays rejected. No CHECK enums — same principle as 0005.
--
-- Applied to the analyst project (kmgltqfwtyhswqxjicab) via MCP before merge.

create table if not exists public.insight_runs (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null,
  trigger       text not null,            -- 'cron' | 'manual'
  triggered_by  text not null,            -- 'nightly-sync' or the dash caller's email
  status        text not null default 'ok',  -- 'ok' | 'numbers_only' (LLM skipped: no key / cap)
  video_count   integer not null default 0,
  analysed_count integer not null default 0,
  report        jsonb not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists insight_runs_created_idx on public.insight_runs (created_at desc);

alter table public.insight_runs enable row level security;
-- service_role bypasses RLS; no anon/authenticated policy on purpose.

create table if not exists public.hypothesis_suggestions (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.insight_runs(id) on delete cascade,
  content_id    uuid not null references public.content(id) on delete cascade,
  tag           text not null,
  rationale     text,
  status        text not null default 'suggested',  -- 'suggested' | 'approved' | 'rejected'
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint hypothesis_suggestions_unique unique (content_id, tag)
);

create index if not exists hypothesis_suggestions_status_idx on public.hypothesis_suggestions (status);

alter table public.hypothesis_suggestions enable row level security;
-- service_role bypasses RLS; no anon/authenticated policy on purpose (apps/api is the only writer).
