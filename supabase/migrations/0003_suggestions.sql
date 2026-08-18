-- 0003_suggestions.sql — M4: persist every suggestion + its check results
-- so M5 (posted/skipped feedback) and M7 (suggestion-vs-outcome scoring)
-- have a write-back target. Append-only in M4; status updated from M5.

create table if not exists suggestions (
  id uuid primary key,
  run_id uuid not null,
  task_id uuid not null,
  agent text not null,
  kind text not null,                     -- 'next_video' | 'counter_offer' (M6)
  payload jsonb not null,                 -- full Suggestion object, Zod-validated in TS
  hypothesis text,                        -- denormalized for easy querying; NULL allowed
  banned_topics_passed boolean not null,
  banned_topics_reasons jsonb not null default '[]'::jsonb,
  brand_voice_passed boolean not null,
  brand_voice_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'surfaced' -- 'surfaced' | 'rejected' | (M5:) 'posted' | 'skipped'
    check (status in ('surfaced', 'rejected', 'posted', 'skipped')),
  created_at timestamptz not null,
  inserted_at timestamptz not null default now()
);

create index if not exists suggestions_run_id_idx on suggestions (run_id);
create index if not exists suggestions_agent_status_idx on suggestions (agent, status);
create index if not exists suggestions_hypothesis_idx on suggestions (hypothesis);

-- Project was created with "auto-expose new tables" off (M2 decision):
grant all on table suggestions to service_role;