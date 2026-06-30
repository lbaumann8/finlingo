-- ============================================================================
-- Finlingo Classroom MVP
-- ----------------------------------------------------------------------------
-- A lightweight "program leader creates a group → learner joins with a code →
-- learner completes a 5-question assignment → leader sees ANONYMOUS group-level
-- learning gaps" flow.
--
-- Privacy model (see section 13 of the spec):
--   * Leaders manage only classrooms they OWN (owner_id = auth.uid()).
--   * Learners access only classrooms they JOINED (membership rows).
--   * Learners read/write only THEIR OWN attempts + responses.
--   * Leaders NEVER get a direct SELECT on raw classroom_responses. They read
--     only aggregates via the SECURITY DEFINER `classroom_aggregate()` RPC,
--     which returns group-level numbers + anonymized teach-it-back excerpts.
--   * Looking a classroom up by join code is done through the SECURITY DEFINER
--     `classroom_join()` RPC so a code never grants a broad SELECT over groups.
--
-- All access is via the public anon/publishable key + the signed-in user's JWT
-- (auth.uid()). The service-role key is NOT required for this feature.
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.classrooms (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  description   text default '',
  audience_type text default 'other',
  join_code     text not null unique,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.classroom_members (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  anon_name    text not null default 'Learner',
  anon_id      text not null,
  joined_at    timestamptz not null default now(),
  -- One membership per authenticated user per classroom (dedupe re-joins).
  unique (classroom_id, user_id)
);

create table if not exists public.classroom_assignments (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title        text not null,
  topic        text not null default '',
  difficulty   text not null default 'beginner',
  content      jsonb not null default '{}'::jsonb,   -- validated question set
  due_date     date,
  status       text not null default 'active',       -- active | closed
  created_at   timestamptz not null default now()
);

create table if not exists public.classroom_attempts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments (id) on delete cascade,
  classroom_id  uuid not null references public.classrooms (id) on delete cascade,
  member_id     uuid not null references public.classroom_members (id) on delete cascade,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  score         integer not null default 0,
  total         integer not null default 0,
  unique (assignment_id, member_id)
);

create table if not exists public.classroom_responses (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.classroom_attempts (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  question_id  text not null,
  skill        text default '',
  response     jsonb not null default '{}'::jsonb,    -- { selectedIndex, correct } | { text }
  is_correct   boolean,
  evaluation   jsonb,                                  -- teach-it-back Claude result
  created_at   timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_classrooms_owner       on public.classrooms (owner_id, created_at desc);
create index if not exists idx_classrooms_join_code   on public.classrooms (join_code);
create index if not exists idx_members_classroom      on public.classroom_members (classroom_id);
create index if not exists idx_members_user           on public.classroom_members (user_id);
create index if not exists idx_assignments_classroom  on public.classroom_assignments (classroom_id, created_at desc);
create index if not exists idx_attempts_assignment    on public.classroom_attempts (assignment_id);
create index if not exists idx_attempts_classroom     on public.classroom_attempts (classroom_id);
create index if not exists idx_responses_classroom    on public.classroom_responses (classroom_id);
create index if not exists idx_responses_attempt      on public.classroom_responses (attempt_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.classrooms            enable row level security;
alter table public.classroom_members     enable row level security;
alter table public.classroom_assignments enable row level security;
alter table public.classroom_attempts    enable row level security;
alter table public.classroom_responses   enable row level security;

-- Helper: classrooms the current user is a member of.
create or replace function public.current_member_classrooms()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select classroom_id from public.classroom_members where user_id = auth.uid();
$$;

-- classrooms ----------------------------------------------------------------
drop policy if exists classrooms_owner_all on public.classrooms;
create policy classrooms_owner_all on public.classrooms
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists classrooms_member_select on public.classrooms;
create policy classrooms_member_select on public.classrooms
  for select using (id in (select public.current_member_classrooms()));

-- classroom_members ---------------------------------------------------------
-- Owner can see membership of classrooms they own (for counts only — the UI
-- never lists individuals). A learner can see/update only their own row.
drop policy if exists members_owner_select on public.classroom_members;
create policy members_owner_select on public.classroom_members
  for select using (
    classroom_id in (select id from public.classrooms where owner_id = auth.uid())
  );

drop policy if exists members_self_select on public.classroom_members;
create policy members_self_select on public.classroom_members
  for select using (user_id = auth.uid());

drop policy if exists members_self_insert on public.classroom_members;
create policy members_self_insert on public.classroom_members
  for insert with check (user_id = auth.uid());

drop policy if exists members_self_update on public.classroom_members;
create policy members_self_update on public.classroom_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- classroom_assignments -----------------------------------------------------
drop policy if exists assignments_owner_all on public.classroom_assignments;
create policy assignments_owner_all on public.classroom_assignments
  for all using (
    classroom_id in (select id from public.classrooms where owner_id = auth.uid())
  ) with check (
    classroom_id in (select id from public.classrooms where owner_id = auth.uid())
  );

drop policy if exists assignments_member_select on public.classroom_assignments;
create policy assignments_member_select on public.classroom_assignments
  for select using (classroom_id in (select public.current_member_classrooms()));

-- classroom_attempts --------------------------------------------------------
-- Learner: full control of their own attempts. Owner: read-only (anonymous —
-- attempts carry member_id, never a name) for completion + accuracy counts.
drop policy if exists attempts_self_all on public.classroom_attempts;
create policy attempts_self_all on public.classroom_attempts
  for all using (
    member_id in (select id from public.classroom_members where user_id = auth.uid())
  ) with check (
    member_id in (select id from public.classroom_members where user_id = auth.uid())
  );

drop policy if exists attempts_owner_select on public.classroom_attempts;
create policy attempts_owner_select on public.classroom_attempts
  for select using (
    classroom_id in (select id from public.classrooms where owner_id = auth.uid())
  );

-- classroom_responses -------------------------------------------------------
-- Learner: insert + read only their OWN responses. There is deliberately NO
-- owner SELECT policy — leaders get group data only through the aggregate RPC.
drop policy if exists responses_self_all on public.classroom_responses;
create policy responses_self_all on public.classroom_responses
  for all using (
    attempt_id in (
      select a.id from public.classroom_attempts a
      join public.classroom_members m on m.id = a.member_id
      where m.user_id = auth.uid()
    )
  ) with check (
    attempt_id in (
      select a.id from public.classroom_attempts a
      join public.classroom_members m on m.id = a.member_id
      where m.user_id = auth.uid()
    )
  );

-- ── RPC: join a classroom by code ───────────────────────────────────────────
-- SECURITY DEFINER so a learner can resolve a code without a broad SELECT over
-- classrooms. Idempotent: re-joining returns the existing membership.
create or replace function public.classroom_join(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class   public.classrooms;
  v_member  public.classroom_members;
  v_name    text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_class
  from public.classrooms
  where upper(join_code) = upper(trim(p_code))
  limit 1;

  if v_class.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then v_name := 'Learner'; end if;
  v_name := left(v_name, 40);

  select * into v_member
  from public.classroom_members
  where classroom_id = v_class.id and user_id = auth.uid()
  limit 1;

  if v_member.id is null then
    insert into public.classroom_members (classroom_id, user_id, anon_name, anon_id)
    values (
      v_class.id, auth.uid(), v_name,
      'm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    )
    returning * into v_member;
  end if;

  return jsonb_build_object(
    'ok', true,
    'classroom', jsonb_build_object(
      'id', v_class.id,
      'name', v_class.name,
      'description', v_class.description,
      'is_demo', v_class.is_demo
    ),
    'member_id', v_member.id,
    'already_member', (v_member.joined_at < now() - interval '2 seconds')
  );
end;
$$;

-- ── RPC: anonymized group aggregate for the OWNER ──────────────────────────
-- Returns only group-level numbers + anonymized teach-it-back excerpts. Never
-- returns learner names or per-student rows. Owner-checked internally.
create or replace function public.classroom_aggregate(p_assignment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_owner    uuid;
  v_learners int;
  v_completed int;
  v_avg numeric;
  v_skill jsonb;
  v_choice jsonb;
  v_teach jsonb;
begin
  select a.classroom_id, c.owner_id
    into v_class_id, v_owner
  from public.classroom_assignments a
  join public.classrooms c on c.id = a.classroom_id
  where a.id = p_assignment;

  if v_class_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select count(*) into v_learners
  from public.classroom_members where classroom_id = v_class_id;

  select count(*) into v_completed
  from public.classroom_attempts
  where assignment_id = p_assignment and completed_at is not null;

  select coalesce(avg(case when total > 0 then score::numeric / total else null end), 0)
    into v_avg
  from public.classroom_attempts
  where assignment_id = p_assignment and completed_at is not null and total > 0;

  -- Per-skill correctness (auto-gradable responses only).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_skill
  from (
    select r.skill,
           count(*) filter (where r.is_correct is not null) as total,
           count(*) filter (where r.is_correct is true)     as correct
    from public.classroom_responses r
    join public.classroom_attempts at on at.id = r.attempt_id
    where at.assignment_id = p_assignment and coalesce(r.skill, '') <> ''
    group by r.skill
  ) t;

  -- Answer distribution per question (for the misconception signal).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_choice
  from (
    select r.question_id,
           (r.response->>'selectedIndex')::int as choice,
           count(*) as n,
           bool_or(r.is_correct) as choice_correct
    from public.classroom_responses r
    join public.classroom_attempts at on at.id = r.attempt_id
    where at.assignment_id = p_assignment
      and r.response ? 'selectedIndex'
    group by r.question_id, (r.response->>'selectedIndex')::int
  ) t;

  -- Anonymized teach-it-back excerpts (no names, capped length + count).
  select coalesce(jsonb_agg(left(r.response->>'text', 280)), '[]'::jsonb) into v_teach
  from (
    select r.response, r.created_at
    from public.classroom_responses r
    join public.classroom_attempts at on at.id = r.attempt_id
    where at.assignment_id = p_assignment
      and r.response ? 'text'
      and length(coalesce(r.response->>'text', '')) > 0
    order by r.created_at desc
    limit 12
  ) r;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', p_assignment,
    'learners', v_learners,
    'completed', v_completed,
    'avg_accuracy', round(v_avg, 4),
    'skill_stats', v_skill,
    'choice_distribution', v_choice,
    'teachback_excerpts', v_teach
  );
end;
$$;

grant execute on function public.classroom_join(text, text)       to anon, authenticated;
grant execute on function public.classroom_aggregate(uuid)        to anon, authenticated;
grant execute on function public.current_member_classrooms()      to anon, authenticated;
