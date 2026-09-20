-- 0011 · X9 Facebook ingestion: allow Facebook as a first-class platform.
-- Keep the existing YouTube Shorts value and extend only the platform constraints.

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
  add constraint content_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok', 'youtube', 'youtube_shorts'));

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
  add constraint performance_platform_check
  check (platform in ('facebook', 'instagram', 'tiktok', 'youtube', 'youtube_shorts'));
