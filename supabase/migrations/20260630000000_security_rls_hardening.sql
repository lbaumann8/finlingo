-- ============================================================================
-- Security Advisor remediation — RLS + least-privilege for the core tables.
-- ----------------------------------------------------------------------------
-- Findings addressed (Supabase Security Advisor):
--   * RLS Disabled in Public: public.users           → enable RLS + own-row policies
--   * RLS Disabled in Public: public.progress        → enable RLS + own-row policies
--   * RLS Disabled in Public: public.leaderboard_view → it is actually a TABLE,
--                                                       not a view; it is empty
--                                                       and unused, so drop it.
--                                                       Leaderboard is served by
--                                                       a new SECURITY DEFINER RPC.
--   * public.unit_jobs                               → already RLS-locked; this
--                                                       migration also revokes the
--                                                       default anon/auth grants so
--                                                       it is service-role-only at
--                                                       the privilege layer too.
--   * GraphQL schema visible to anon/authenticated   → revoke graphql_public usage
--                                                       (the app uses PostgREST only)
--
-- Access model after this migration:
--   * Browser uses the publishable (anon) key + the signed-in user's JWT.
--     auth.uid() is the user's UUID. Every row in users/progress is keyed to
--     that UUID, so a user can read/write ONLY their own profile + progress.
--   * The leaderboard is served by public.leaderboard_top(), a SECURITY DEFINER
--     function that returns ONLY safe, aggregated-style fields (display name, xp,
--     streak, tier, and an is_you flag) — never email, never another user's UUID.
--   * Server-side Vercel functions use the SERVICE ROLE key, which bypasses RLS,
--     so unit_jobs and the Stripe webhook's progress writes keep working.
--
-- This migration is idempotent and safe to re-run.
-- ============================================================================

-- ── public.users ────────────────────────────────────────────────────────────
alter table public.users enable row level security;

-- Strip Supabase's default GRANT ALL (which includes DELETE) from both roles,
-- then grant back only what the client needs. anon never touches users; the
-- leaderboard reads names via the definer RPC. authenticated manages only its
-- own row and never deletes it from the client.
revoke all on public.users from anon, authenticated;
grant select, insert, update on public.users to authenticated;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (id = auth.uid());

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (id = auth.uid());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── public.progress ─────────────────────────────────────────────────────────
alter table public.progress enable row level security;

revoke all on public.progress from anon, authenticated;
grant select, insert, update on public.progress to authenticated;

drop policy if exists progress_select_own on public.progress;
create policy progress_select_own on public.progress
  for select using (user_id = auth.uid());

drop policy if exists progress_insert_own on public.progress;
create policy progress_insert_own on public.progress
  for insert with check (user_id = auth.uid());

drop policy if exists progress_update_own on public.progress;
create policy progress_update_own on public.progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── public.leaderboard_view — drop the unused TABLE ─────────────────────────
-- Despite the name, public.leaderboard_view is an ordinary TABLE (relkind 'r'),
-- not a view — a bare `drop view` failed in production with 42809 ("is not a
-- view"). Live inspection confirmed it is disposable: 0 rows, no indexes, no
-- constraints, no dependent objects, and referenced NOWHERE in the app or git
-- history. The live leaderboard is served by the leaderboard_top() RPC below,
-- which reads progress + users and never touches this table.
--
-- It is therefore safe to remove. No CASCADE is used (it has no dependents).
drop table if exists public.leaderboard_view;

-- Safe, minimal leaderboard. SECURITY DEFINER so a signed-out or signed-in user
-- can see the top board without a broad SELECT over progress/users. Returns no
-- email and no other user's UUID; is_you is computed from the caller's JWT.
create or replace function public.leaderboard_top(p_limit integer default 20)
returns table (
  rank   integer,
  name   text,
  xp     bigint,
  streak integer,
  tier   text,
  is_you boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by coalesce(p.xp, 0) desc, p.user_id)::int as rank,
    coalesce(u.name, 'User')                                            as name,
    coalesce(p.xp, 0)::bigint                                           as xp,
    greatest(0, coalesce(p.streak, 0))::int                            as streak,
    coalesce(p.tier, 'standard')                                        as tier,
    (p.user_id = auth.uid())                                            as is_you
  from public.progress p
  left join public.users u on u.id = p.user_id
  order by coalesce(p.xp, 0) desc, p.user_id
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.leaderboard_top(integer) from public;
grant execute on function public.leaderboard_top(integer) to anon, authenticated;

-- ── public.unit_jobs — service-role only (defense in depth) ─────────────────
-- RLS was already enabled with no policies (deny-all to anon/authenticated).
-- Also strip the default table grants so the lockdown holds at the privilege
-- layer, not only via RLS. The server functions use the service-role key, which
-- is exempt from both grants and RLS.
alter table public.unit_jobs enable row level security;
revoke all on public.unit_jobs from anon, authenticated;

-- ── GraphQL schema exposure ─────────────────────────────────────────────────
-- The app talks to PostgREST (/rest/v1) only — it never uses the GraphQL API
-- (/graphql/v1). Revoking usage on graphql_public hides schema introspection
-- from anon/authenticated and closes the "objects visible in the GraphQL schema"
-- finding. Reversible: re-grant usage + execute if a GraphQL client is ever added.
revoke usage on schema graphql_public from anon, authenticated;
