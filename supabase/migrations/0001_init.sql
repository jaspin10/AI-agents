-- M2 migration 0001: core memory tables (master spec §3)
-- Run once in the Supabase SQL editor.

create extension if not exists vector;

-- §4/§6: every agent action, mirrors AgentLogRowSchema in @platform/shared
create table agent_logs (
  run_id      uuid        not null,
  task_id     uuid,
  agent       text        not null,
  tool        text        not null,
  status      text        not null check (status in ('ok', 'rejected', 'error')),
  input       jsonb,
  output      jsonb,
  error       text,
  started_at  timestamptz not null,
  finished_at timestamptz not null,
  inserted_at timestamptz not null default now()
);
create index agent_logs_run_id_idx on agent_logs (run_id);
create index agent_logs_agent_status_idx on agent_logs (agent, status);

-- Brand constitution chunks; embedding nullable — backfilled in M4
create table brand_assets (
  id          uuid        primary key default gen_random_uuid(),
  source      text        not null default 'brand-voice.md',
  version     text        not null,
  chunk_index int         not null,
  heading     text,
  content     text        not null,
  embedding   vector(1536),
  ingested_at timestamptz not null default now(),
  unique (source, version, chunk_index)
);

-- Every posted video + its hypothesis tag (owner-entered until M3 sync)
create table content (
  id           uuid        primary key default gen_random_uuid(),
  platform     text        not null check (platform in ('instagram', 'tiktok', 'youtube')),
  platform_video_id text   not null,
  title        text,
  hook         text,
  format       text,
  hypothesis   text        check (hypothesis in ('H1', 'H2', 'H3')),
  posted_at    timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (platform, platform_video_id)
);

-- Metrics per video per platform over time; mirrors PerformanceRecordSchema
create table performance (
  id                    uuid        primary key default gen_random_uuid(),
  content_id            text        not null, -- platform-native id until M3 links to content.id
  platform              text        not null check (platform in ('instagram', 'tiktok', 'youtube')),
  captured_at           timestamptz not null,
  views                 integer     not null check (views >= 0),
  likes                 integer     not null check (likes >= 0),
  comments              integer     not null check (comments >= 0),
  shares                integer     not null check (shares >= 0),
  saves                 integer     check (saves >= 0),
  avg_watch_time_seconds double precision check (avg_watch_time_seconds >= 0),
  retention_pct         double precision check (retention_pct between 0 and 100),
  followers_at_capture  integer     check (followers_at_capture >= 0)
);
create index performance_content_idx on performance (platform, content_id, captured_at);

-- §6 privacy: pseudonymized from day one — no names, no contact details
create table conversations (
  id          uuid        primary key default gen_random_uuid(),
  pseudonym   text        not null, -- e.g. 'lead-0042', never a real name
  archetype   text,
  objection   text,
  outcome     text        check (outcome in ('enrolled', 'lost', 'pending')),
  summary     text,
  occurred_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Stripe-shaped (owner decision 2026-08-16); ingestion lands in M3
create table enrollments (
  id                         uuid        primary key default gen_random_uuid(),
  stripe_customer_id         text,
  stripe_checkout_session_id text        unique,
  stripe_payment_intent_id   text,
  amount_cents               integer     check (amount_cents >= 0),
  currency                   text        default 'cad',
  status                     text        not null default 'paid',
  course_level               text        check (course_level in ('beginner', 'intermediate', 'advanced')),
  enrolled_at                timestamptz not null,
  created_at                 timestamptz not null default now()
);

-- KPI 2 baseline: manual demo-send log, entered by owner
create table demo_log (
  id           uuid        primary key default gen_random_uuid(),
  pseudonym    text        not null,
  sent_at      timestamptz not null,
  channel      text, -- whatsapp | instagram_dm | email | other
  converted    boolean,
  converted_at timestamptz,
  created_at   timestamptz not null default now()
);