-- Analyst database ONLY. Prepared, not applied. C4: no historical score rewrite.
alter table public.performance add column if not exists provenance jsonb not null default '{}'::jsonb;
create table public.llm_call_reservations (
 id uuid primary key, month text not null, tokens bigint not null check(tokens > 0),
 settled boolean not null default false, created_at timestamptz not null default now()
);
create index llm_call_reservations_month_idx on public.llm_call_reservations(month) where not settled;
alter table public.llm_call_reservations enable row level security;
revoke all on public.llm_call_reservations from public, anon, authenticated;
grant select, insert, update on public.llm_call_reservations to service_role;
create function public.reserve_llm_call(p_id uuid, p_tokens bigint, p_cap bigint) returns void
language plpgsql security invoker set search_path = '' as $$
declare m text := to_char(now() at time zone 'UTC', 'YYYY-MM'); used bigint;
begin
 if p_tokens <= 0 or p_cap <= 0 then raise exception 'invalid_budget'; end if;
 perform pg_advisory_xact_lock(91010);
 if exists(select 1 from public.llm_call_reservations where id=p_id) then raise exception 'duplicate_reservation'; end if;
 select coalesce(sum(input_tokens::bigint + output_tokens),0) into used from public.llm_usage where month=m;
 select used + coalesce(sum(tokens),0) into used from public.llm_call_reservations where month=m and not settled;
 if used + p_tokens > p_cap then raise exception 'LLM_CAP_EXCEEDED'; end if;
 insert into public.llm_call_reservations(id,month,tokens) values(p_id,m,p_tokens);
end $$;
create function public.settle_llm_call(p_id uuid, p_run uuid, p_agent text, p_model text, p_input integer, p_output integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare r public.llm_call_reservations;
begin
 perform pg_advisory_xact_lock(91010);
 select * into r from public.llm_call_reservations where id=p_id for update;
 if not found then raise exception 'reservation_missing'; end if;
 if r.settled then return; end if;
 if p_input < 0 or p_output < 0 or p_input::bigint+p_output > r.tokens then raise exception 'reservation_overrun'; end if;
 insert into public.llm_usage(run_id,agent,model,input_tokens,output_tokens,month) values(p_run,p_agent,p_model,p_input,p_output,r.month);
 update public.llm_call_reservations set settled=true where id=p_id;
end $$;
revoke all on function public.reserve_llm_call(uuid,bigint,bigint) from public, anon, authenticated;
revoke all on function public.settle_llm_call(uuid,uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_llm_call(uuid,bigint,bigint) to service_role;
grant execute on function public.settle_llm_call(uuid,uuid,text,text,integer,integer) to service_role;
-- Failed/uncertain calls keep their reservation for the month: conservative, no automatic release.
