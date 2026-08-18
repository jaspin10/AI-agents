-- Milestone 3: analytics ingestion
-- Adds idempotency keys for re-runnable syncs and the Stripe product name.

-- 1. performance: one row per video per UTC day -------------------------

alter table public.performance
  add column if not exists captured_date date;

-- Backfill any existing rows from their capture timestamp.
update public.performance
  set captured_date = (captured_at at time zone 'utc')::date
  where captured_date is null;

alter table public.performance
  alter column captured_date set not null;

create unique index if not exists performance_content_day_key
  on public.performance (content_id, captured_date);


-- 2. enrollments: Stripe product name + idempotent natural key ----------

alter table public.enrollments
  add column if not exists stripe_product_name text;

-- course_level stays null in M3 (Stripe catalogue naming is inconsistent).
alter table public.enrollments
  alter column course_level drop not null;

create unique index if not exists enrollments_checkout_session_key
  on public.enrollments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;


-- 3. content: hypothesis stays nullable, never guessed ------------------

alter table public.content
  alter column hypothesis drop not null;