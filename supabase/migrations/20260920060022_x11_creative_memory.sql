-- Analyst ONLY. No storage buckets/media ingestion. NOT applied to production.
create table public.studio_records (
 id uuid primary key, kind text not null constraint studio_kind_check check(kind in ('memory')),
 entity_key text not null, version integer not null check(version>0), body jsonb not null,
 updated_by text not null, updated_at timestamptz not null default now(),
 unique(kind,entity_key), check(jsonb_typeof(body)='object' and octet_length(body::text)<=150000)
);
create table public.studio_revisions (
 id uuid not null references public.studio_records(id), kind text not null, entity_key text not null,
 version integer not null, body jsonb not null, updated_by text not null, updated_at timestamptz not null,
 request_id uuid not null unique, primary key(id,version)
);
alter table public.studio_records enable row level security;
alter table public.studio_revisions enable row level security;
revoke all on public.studio_records,public.studio_revisions from public,anon,authenticated;
grant select,insert,update on public.studio_records to service_role;
grant select,insert on public.studio_revisions to service_role;
create index studio_records_kind_updated_idx on public.studio_records(kind,updated_at desc);
create function public.save_studio_record(p_id uuid,p_kind text,p_entity text,p_expected integer,p_body jsonb,p_actor text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old public.studio_records; saved public.studio_records; replay public.studio_revisions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into replay from public.studio_revisions where request_id=p_request;
 if found then
  if replay.id<>p_id or replay.kind<>p_kind or replay.entity_key<>p_entity or replay.body<>p_body or replay.updated_by<>p_actor then raise exception 'request_conflict'; end if;
  return to_jsonb(replay)-'request_id';
 end if;
 if p_expected<0 or p_actor='' or p_entity='' then raise exception 'invalid_record'; end if;
 select * into old from public.studio_records where id=p_id for update;
 if found then
  if old.kind<>p_kind or old.entity_key<>p_entity or old.version<>p_expected then raise exception 'version_conflict'; end if;
 else
  if p_expected<>0 then raise exception 'version_conflict'; end if;
 end if;
 if p_kind='memory' and not exists(select 1 from public.content where id=p_id) then raise exception 'content_missing'; end if;
 insert into public.studio_records(id,kind,entity_key,version,body,updated_by) values(p_id,p_kind,p_entity,p_expected+1,p_body,p_actor)
 on conflict(id) do update set version=excluded.version,body=excluded.body,updated_by=excluded.updated_by,updated_at=now()
 returning * into saved;
 insert into public.studio_revisions(id,kind,entity_key,version,body,updated_by,updated_at,request_id)
 values(saved.id,saved.kind,saved.entity_key,saved.version,saved.body,saved.updated_by,saved.updated_at,p_request);
 return to_jsonb(saved);
end $$;
revoke all on function public.save_studio_record(uuid,text,text,integer,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.save_studio_record(uuid,text,text,integer,jsonb,text,uuid) to service_role;
