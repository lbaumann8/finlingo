-- Finlingo durable unit-generation jobs.
--
-- These rows are written and read ONLY by the server-side Vercel functions
-- using the Supabase service-role key (which bypasses RLS). RLS is enabled with
-- no policies, so the public anon / publishable key used by the browser cannot
-- read or write this table. Never expose the service-role key to the frontend.

create table if not exists public.unit_jobs (
  job_id                     text primary key,
  client_request_id          text not null unique,
  original_topic             text not null,
  canonical_topic            text not null,
  selected_depth             text not null,
  min_lessons                integer not null,
  max_lessons                integer not null,
  target_lesson_count        integer not null,
  source_chat_id             text default '',
  source_message_id          text default '',
  status                     text not null default 'queued',
  stage                      text not null default 'queued',
  partial_outline            jsonb,
  completed_lessons          jsonb not null default '[]'::jsonb,
  recap_quiz                 jsonb,
  retry_count                integer not null default 0,
  final_unit                 jsonb,
  failure_category           text,
  failed_component           text,
  course_outline_requested   boolean not null default false,
  scope_reason               text default '',
  approved_lesson_concepts   jsonb not null default '[]'::jsonb,
  lease_until                timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  started_at                 timestamptz,
  completed_at               timestamptz,
  cancelled_at               timestamptz
);

create index if not exists idx_unit_jobs_chat   on public.unit_jobs (source_chat_id, created_at desc);
create index if not exists idx_unit_jobs_status  on public.unit_jobs (status, updated_at);
create index if not exists idx_unit_jobs_updated on public.unit_jobs (updated_at);

-- Lock the table down. The server functions use the service-role key, which
-- bypasses RLS; with RLS enabled and no policies, anon/authenticated cannot
-- touch these rows.
alter table public.unit_jobs enable row level security;

-- ── Cleanup so the table never grows without bound ──────────────────────
-- The app already performs best-effort cleanup on each job creation (it deletes
-- rows whose updated_at is older than ~2 days). The optional pg_cron job below
-- is a belt-and-suspenders backstop. It is safe to skip if pg_cron is not
-- enabled on your Supabase plan.
--
--   create extension if not exists pg_cron;
--   select cron.schedule(
--     'finlingo-unit-jobs-cleanup',
--     '0 * * * *',
--     $$ delete from public.unit_jobs where updated_at < now() - interval '2 days' $$
--   );
