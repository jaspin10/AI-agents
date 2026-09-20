-- Analyst ONLY; prepared NOT applied. C1 approved. No publishing capability.
alter table public.studio_records drop constraint studio_kind_check;
alter table public.studio_records add constraint studio_kind_check check(kind in ('memory','research','brief'));
create table public.studio_jobs (
 id uuid primary key, record_id uuid not null references public.studio_records(id),
 stage text not null check(stage in ('hooks','draft','checks')), actor text not null,
 status text not null default 'running' check(status in ('running','complete','failed')),
 created_at timestamptz not null default now()
);
create unique index studio_jobs_one_active on public.studio_jobs(record_id) where status='running';
alter table public.studio_jobs enable row level security;
revoke all on public.studio_jobs from public,anon,authenticated;
grant select,insert,update on public.studio_jobs to service_role;
-- Reusing a request ID or overlapping a running job is rejected before any paid call.
-- A crashed process leaves a visible running job; owner can cancel it explicitly.
