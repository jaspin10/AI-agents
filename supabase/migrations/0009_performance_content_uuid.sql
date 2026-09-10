-- 0009 · X2 (locked 2026-09-10, Jas): performance.content_id holds
-- platform-native video ids (the M4.5 bug), so every join has had to go
-- through content.platform_video_id. X2 does the heaviest joining in the
-- project, so the ambiguity ends here: add a real UUID FK, backfill it,
-- and keep it filled on every insert by trigger — the sync writer does not
-- need to look the UUID up itself, and a dry run is unaffected.
--
-- Verified before writing (2026-09-10): all 636 existing performance rows
-- match a content.platform_video_id; zero match a content.id.
--
-- The old text column stays for now (the (content_id, captured_date)
-- unique key and the sync upsert still use it). Dropping it is a follow-up
-- once nothing reads it.

alter table public.performance
  add column if not exists content_uuid uuid references public.content(id) on delete cascade;

update public.performance p
   set content_uuid = c.id
  from public.content c
 where p.content_uuid is null
   and c.platform_video_id = p.content_id;

create index if not exists performance_content_uuid_captured_idx
  on public.performance (content_uuid, captured_date);

create or replace function public.performance_fill_content_uuid()
returns trigger language plpgsql as $$
begin
  if new.content_uuid is null then
    select id into new.content_uuid from public.content where platform_video_id = new.content_id limit 1;
  end if;
  return new;
end $$;

drop trigger if exists performance_fill_content_uuid on public.performance;
create trigger performance_fill_content_uuid
  before insert or update of content_id on public.performance
  for each row execute function public.performance_fill_content_uuid();
