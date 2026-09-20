-- ANALYST ONLY. Prepared and locally tested; NOT applied to any remote database.
alter table public.studio_records drop constraint studio_kind_check;
alter table public.studio_records add constraint studio_kind_check check(kind in ('memory','research','brief','production'));
create table public.production_lineage (
 id uuid primary key default gen_random_uuid(),
 production_id uuid not null references public.studio_records(id),
 production_version integer not null,
 brief_id uuid not null,
 brief_version integer not null,
 asset_version text not null,
 asset_fingerprint text not null,
 content_uuid uuid not null unique references public.content(id),
 basis text not null default 'human_confirmed' check(basis='human_confirmed'),
 confirmed_by text not null,
 confirmed_at timestamptz not null default now(),
 request_id uuid not null unique,
 foreign key(production_id,production_version) references public.studio_revisions(id,version),
 foreign key(brief_id,brief_version) references public.studio_revisions(id,version)
);
alter table public.production_lineage enable row level security;
revoke all on public.production_lineage from public,anon,authenticated;
grant select,insert on public.production_lineage to service_role;
create index production_lineage_production on public.production_lineage(production_id);
create index production_lineage_brief on public.production_lineage(brief_id,brief_version);

create function public.confirm_production_lineage(p_id uuid,p_expected integer,p_content uuid,p_actor text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.studio_records; prior public.production_lineage; brief public.studio_revisions; a jsonb; saved jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into prior from public.production_lineage where request_id=p_request;
 if found then
  if prior.production_id<>p_id or prior.content_uuid<>p_content or prior.confirmed_by<>p_actor then raise exception 'request_conflict'; end if;
  select to_jsonb(v)-'request_id' into saved from public.studio_revisions v where id=p_id and version=prior.production_version;
  return saved;
 end if;
 select * into r from public.studio_records where id=p_id for update;
 if not found or r.kind<>'production' then raise exception 'production_missing'; end if;
 if r.version<>p_expected then raise exception 'version_conflict'; end if;
 if p_actor='' or coalesce(r.body->>'stage','') not in ('approved','posted') then raise exception 'exact_approval_required'; end if;
 a=r.body->'approval';
 if a is null or a='null'::jsonb or a->>'assetVersion' is distinct from r.body->>'currentAssetVersion'
 or a->>'briefId' is distinct from r.body->>'briefId' or a->>'briefVersion' is distinct from r.body->>'briefVersion'
 or not exists(select 1 from jsonb_array_elements(r.body->'assets') asset where asset->>'version'=a->>'assetVersion' and asset->>'fingerprint'=a->>'fingerprint') then raise exception 'exact_approval_required'; end if;
 select * into brief from public.studio_revisions where id=(r.body->>'briefId')::uuid and version=(r.body->>'briefVersion')::integer and kind='brief';
 if not found or brief.body->'approval' is null or brief.body->'approval'='null'::jsonb or (brief.body->'approval'->>'version')::integer is distinct from brief.version then raise exception 'approved_brief_required'; end if;
 if not exists(select 1 from public.content where id=p_content) then raise exception 'content_missing'; end if;
 saved=public.save_studio_record(p_id,'production',r.entity_key,p_expected,jsonb_set(r.body,'{stage}','"posted"'::jsonb),p_actor,p_request);
 insert into public.production_lineage(production_id,production_version,brief_id,brief_version,asset_version,asset_fingerprint,content_uuid,confirmed_by,request_id)
 values(p_id,(saved->>'version')::integer,brief.id,brief.version,a->>'assetVersion',a->>'fingerprint',p_content,p_actor,p_request);
 return saved;
end $$;
revoke all on function public.confirm_production_lineage(uuid,integer,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_production_lineage(uuid,integer,uuid,text,uuid) to service_role;
-- No backfill: historical X6 inferred matches remain unchanged and inferred.
