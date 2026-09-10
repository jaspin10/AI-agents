-- 0008 · Distinguish YouTube Shorts from regular YouTube videos (locked
-- 2026-09-10, Jas). Locked design: a separate `platform` value
-- ('youtube_shorts') rather than a subtype field, so the platform-agnostic
-- Analysis page/filters/pairing pick it up with zero dash code changes.
-- YouTube's Data API has no official "is this a Short" flag; classification
-- is by duration (<=60s) at sync time — see packages/integrations/src/sync.ts.
-- Existing content rows currently mislabelled 'youtube' self-correct on the
-- next nightly sync (07:00 UTC), which reclassifies in place by content id —
-- no manual backfill needed, no content_analysis FK broken.

-- Constraint names found dynamically rather than assumed, since they were
-- never explicitly named in migration 0001.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.content'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%platform%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.content DROP CONSTRAINT %I', c);
  END IF;
END $$;
alter table public.content
  add constraint content_platform_check check (platform in ('instagram', 'tiktok', 'youtube', 'youtube_shorts'));

DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.performance'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%platform%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.performance DROP CONSTRAINT %I', c);
  END IF;
END $$;
alter table public.performance
  add constraint performance_platform_check check (platform in ('instagram', 'tiktok', 'youtube', 'youtube_shorts'));
