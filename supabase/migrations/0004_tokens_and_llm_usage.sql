-- 0004: token persistence for rotating OAuth tokens (TikTok) + monthly LLM spend tracking (§6 cap)

create table if not exists tokens (
  provider text primary key,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

comment on table tokens is
  'Rotating OAuth refresh tokens, written back by sync jobs. One row per provider. Seeded from .env on first run.';

create table if not exists llm_usage (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  agent text not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  month text not null, -- 'YYYY-MM' UTC, denormalized for the cap query
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_month_idx on llm_usage (month);

comment on table llm_usage is
  'One row per LLM run. Monthly sum vs LLM_MONTHLY_CAP enforces the §6 hard spend cap.';

-- Project was created with auto-expose off — grant explicitly (same as 0001).
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;