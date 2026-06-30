-- Finlingo Live Classroom: untimed, leader-paced, anonymous sessions.
-- All mutations use owner/member checked RPCs. Raw live responses are never
-- selectable by leaders or other learners.

create table if not exists public.classroom_live_sessions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'lobby' check (state in ('lobby','question_open','results','paused','complete')),
  current_question_index integer not null default -1,
  question_order jsonb not null default '[]'::jsonb,
  current_question jsonb,
  recap jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.classroom_live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_live_sessions(id) on delete cascade,
  member_id uuid not null references public.classroom_members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(session_id, member_id)
);

create table if not exists public.classroom_live_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_live_sessions(id) on delete cascade,
  participant_id uuid not null references public.classroom_live_participants(id) on delete cascade,
  question_key text not null,
  response jsonb not null default '{}'::jsonb,
  confidence text check (confidence is null or confidence in ('know','unsure','guessing')),
  is_correct boolean,
  created_at timestamptz not null default now(),
  unique(session_id, participant_id, question_key)
);

create table if not exists public.classroom_live_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_live_sessions(id) on delete cascade,
  participant_id uuid not null references public.classroom_live_participants(id) on delete cascade,
  question text not null check (length(question) between 1 and 400),
  status text not null default 'open' check (status in ('open','recap','answered')),
  created_at timestamptz not null default now()
);

create index if not exists idx_live_sessions_classroom on public.classroom_live_sessions(classroom_id, created_at desc);
create index if not exists idx_live_participants_session on public.classroom_live_participants(session_id);
create index if not exists idx_live_responses_session_question on public.classroom_live_responses(session_id, question_key);
create index if not exists idx_live_questions_session on public.classroom_live_questions(session_id, created_at desc);

alter table public.classroom_live_sessions enable row level security;
alter table public.classroom_live_participants enable row level security;
alter table public.classroom_live_responses enable row level security;
alter table public.classroom_live_questions enable row level security;

drop policy if exists live_sessions_owner_select on public.classroom_live_sessions;
create policy live_sessions_owner_select on public.classroom_live_sessions for select
  using (owner_id = auth.uid());
drop policy if exists live_sessions_participant_select on public.classroom_live_sessions;
-- Learners intentionally have no direct session-table SELECT. The learner
-- snapshot RPC returns only the current question and strips the answer while open.

drop policy if exists live_participants_self_select on public.classroom_live_participants;
create policy live_participants_self_select on public.classroom_live_participants for select
  using (member_id in (select id from public.classroom_members where user_id = auth.uid()));

-- No table-level SELECT policy exists for live responses or anonymous questions.
-- Leaders receive aggregates only through classroom_live_leader_snapshot().

create or replace function public.classroom_live_create(p_assignment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_assignment public.classroom_assignments; v_class public.classrooms; v_session public.classroom_live_sessions;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authenticated'); end if;
  select * into v_assignment from public.classroom_assignments where id=p_assignment and status='active';
  select * into v_class from public.classrooms where id=v_assignment.classroom_id;
  if v_assignment.id is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
  if v_class.owner_id is distinct from auth.uid() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  select * into v_session from public.classroom_live_sessions
   where assignment_id=p_assignment and state <> 'complete' order by created_at desc limit 1;
  if v_session.id is null then
    insert into public.classroom_live_sessions(classroom_id,assignment_id,owner_id,question_order)
    values(v_assignment.classroom_id,p_assignment,auth.uid(),coalesce(v_assignment.content->'questions','[]'::jsonb)) returning * into v_session;
  end if;
  return jsonb_build_object('ok',true,'session',to_jsonb(v_session));
end $$;

create or replace function public.classroom_live_join(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session public.classroom_live_sessions; v_member uuid; v_participant public.classroom_live_participants;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','not_authenticated'); end if;
  select * into v_session from public.classroom_live_sessions where id=p_session and state <> 'complete';
  if v_session.id is null then return jsonb_build_object('ok',false,'error','session_not_found'); end if;
  select id into v_member from public.classroom_members where classroom_id=v_session.classroom_id and user_id=auth.uid();
  if v_member is null then return jsonb_build_object('ok',false,'error','not_a_member'); end if;
  insert into public.classroom_live_participants(session_id,member_id) values(p_session,v_member)
  on conflict(session_id,member_id) do update set joined_at=classroom_live_participants.joined_at returning * into v_participant;
  return jsonb_build_object('ok',true,'participant_id',v_participant.id);
end $$;

create or replace function public.classroom_live_find(p_classroom uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  if not exists(select 1 from public.classroom_members where classroom_id=p_classroom and user_id=auth.uid()) then
    return jsonb_build_object('ok',false,'error','not_a_member');
  end if;
  select id into v_session from public.classroom_live_sessions
    where classroom_id=p_classroom and state<>'complete' order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'session_id',v_session);
end $$;

create or replace function public.classroom_live_control(p_session uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.classroom_live_sessions; v_next integer; v_q jsonb; v_count integer;
begin
  select * into v from public.classroom_live_sessions where id=p_session for update;
  if v.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v.owner_id is distinct from auth.uid() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  if p_action='start' and v.state='lobby' then
    v_next:=0; v_q:=v.question_order->v_next;
    update public.classroom_live_sessions set state='question_open',current_question_index=v_next,current_question=v_q,started_at=coalesce(started_at,now()) where id=v.id;
  elsif p_action='close' and v.state='question_open' then
    update public.classroom_live_sessions set state='results' where id=v.id;
  elsif p_action='continue' and v.state='results' then
    v_next:=v.current_question_index+1; v_count:=jsonb_array_length(v.question_order);
    if v_next>=v_count then update public.classroom_live_sessions set state='complete',ended_at=now() where id=v.id;
    else v_q:=v.question_order->v_next; update public.classroom_live_sessions set state='question_open',current_question_index=v_next,current_question=v_q where id=v.id; end if;
  elsif p_action='pause' and v.state='question_open' then
    update public.classroom_live_sessions set state='paused' where id=v.id;
  elsif p_action='resume' and v.state='paused' then
    update public.classroom_live_sessions set state='question_open' where id=v.id;
  elsif p_action='end' and v.state<>'complete' then
    update public.classroom_live_sessions set state='complete',ended_at=now() where id=v.id;
  elsif p_action='ask_room' and v.state in ('results','paused') and jsonb_typeof(p_payload)='object' then
    v_q:=p_payload || jsonb_build_object('id','live_'||replace(gen_random_uuid()::text,'-',''));
    update public.classroom_live_sessions set question_order=jsonb_insert(question_order,array[current_question_index::text],v_q,true),
      current_question_index=current_question_index+1,current_question=v_q,state='question_open' where id=v.id;
  else return jsonb_build_object('ok',false,'error','invalid_transition','state',v.state);
  end if;
  select * into v from public.classroom_live_sessions where id=p_session;
  return jsonb_build_object('ok',true,'session',to_jsonb(v));
end $$;

create or replace function public.classroom_live_submit(p_session uuid, p_response jsonb, p_confidence text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.classroom_live_sessions; v_pid uuid; v_key text; v_correct boolean; v_selected integer; v_answer integer;
begin
  select * into v from public.classroom_live_sessions where id=p_session;
  if v.id is null or v.state<>'question_open' then return jsonb_build_object('ok',false,'error','responses_closed'); end if;
  select p.id into v_pid from public.classroom_live_participants p join public.classroom_members m on m.id=p.member_id
   where p.session_id=p_session and m.user_id=auth.uid();
  if v_pid is null then return jsonb_build_object('ok',false,'error','not_joined'); end if;
  if p_confidence is not null and p_confidence not in ('know','unsure','guessing') then return jsonb_build_object('ok',false,'error','invalid_confidence'); end if;
  v_key:=coalesce(v.current_question->>'id',v.current_question_index::text);
  if v.current_question->>'type' in ('mcq','agree') then
    begin v_selected:=(p_response->>'selectedIndex')::integer; v_answer:=(v.current_question->>'answerIndex')::integer; v_correct:=(v_selected=v_answer); exception when others then return jsonb_build_object('ok',false,'error','invalid_response'); end;
  end if;
  insert into public.classroom_live_responses(session_id,participant_id,question_key,response,confidence,is_correct)
  values(p_session,v_pid,v_key,p_response,p_confidence,v_correct)
  on conflict(session_id,participant_id,question_key) do nothing;
  if not found then return jsonb_build_object('ok',false,'error','already_answered'); end if;
  return jsonb_build_object('ok',true,'is_correct',v_correct);
end $$;

create or replace function public.classroom_live_ask(p_session uuid, p_question text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_q text;
begin
  select p.id into v_pid from public.classroom_live_participants p join public.classroom_members m on m.id=p.member_id
   join public.classroom_live_sessions s on s.id=p.session_id where p.session_id=p_session and m.user_id=auth.uid() and s.state<>'complete';
  if v_pid is null then return jsonb_build_object('ok',false,'error','not_joined'); end if;
  v_q:=left(btrim(coalesce(p_question,'')),400); if v_q='' then return jsonb_build_object('ok',false,'error','empty'); end if;
  insert into public.classroom_live_questions(session_id,participant_id,question) values(p_session,v_pid,v_q);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.classroom_live_question_action(p_session uuid, p_question uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_status text;
begin
  select owner_id into v_owner from public.classroom_live_sessions where id=p_session;
  if v_owner is distinct from auth.uid() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  v_status:=case p_action when 'answer' then 'answered' when 'recap' then 'recap' else null end;
  if v_status is null then return jsonb_build_object('ok',false,'error','invalid_action'); end if;
  update public.classroom_live_questions set status=v_status where id=p_question and session_id=p_session;
  return jsonb_build_object('ok',found);
end $$;

create or replace function public.classroom_live_learner_snapshot(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.classroom_live_sessions; v_pid uuid; v_answered boolean; v_key text; v_count integer; v_question jsonb;
begin
  select * into v from public.classroom_live_sessions where id=p_session;
  select p.id into v_pid from public.classroom_live_participants p join public.classroom_members m on m.id=p.member_id where p.session_id=p_session and m.user_id=auth.uid();
  if v.id is null or v_pid is null then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  v_key:=coalesce(v.current_question->>'id',v.current_question_index::text);
  select exists(select 1 from public.classroom_live_responses where session_id=p_session and participant_id=v_pid and question_key=v_key) into v_answered;
  select count(*) into v_count from public.classroom_live_participants where session_id=p_session;
  v_question:=v.current_question;
  if v.state in ('lobby','question_open','paused') then v_question:=v_question-'answerIndex'-'explanation'; end if;
  return jsonb_build_object('ok',true,'session',jsonb_build_object('id',v.id,'state',v.state,'current_question_index',v.current_question_index,
    'question_count',jsonb_array_length(v.question_order),'current_question',v_question,'recap',v.recap),
    'participant_count',v_count,'answered',v_answered);
end $$;

create or replace function public.classroom_live_leader_snapshot(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.classroom_live_sessions; v_key text; v_participants integer; v_answered integer; v_answers jsonb; v_conf jsonb; v_states jsonb; v_overall jsonb; v_questions jsonb;
begin
  select * into v from public.classroom_live_sessions where id=p_session;
  if v.id is null or v.owner_id is distinct from auth.uid() then return jsonb_build_object('ok',false,'error','forbidden'); end if;
  v_key:=coalesce(v.current_question->>'id',v.current_question_index::text);
  select count(*) into v_participants from public.classroom_live_participants where session_id=p_session;
  select count(*) into v_answered from public.classroom_live_responses where session_id=p_session and question_key=v_key;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_answers from (select response->>'selectedIndex' choice,count(*) n,count(*) filter(where is_correct) correct from public.classroom_live_responses where session_id=p_session and question_key=v_key group by response->>'selectedIndex') x;
  select coalesce(jsonb_object_agg(confidence,n),'{}'::jsonb) into v_conf from (select coalesce(confidence,'none') confidence,count(*) n from public.classroom_live_responses where session_id=p_session and question_key=v_key group by confidence) x;
  select coalesce(jsonb_object_agg(learning_state,n),'{}'::jsonb) into v_states from (select case when is_correct and confidence='know' then 'understood' when is_correct then 'fragile' when not is_correct and confidence='know' then 'misconception' else 'gap' end learning_state,count(*) n from public.classroom_live_responses where session_id=p_session and question_key=v_key and is_correct is not null group by 1) x;
  select coalesce(jsonb_object_agg(learning_state,n),'{}'::jsonb) into v_overall from (select case when is_correct and confidence='know' then 'understood' when is_correct then 'fragile' when not is_correct and confidence='know' then 'misconception' else 'gap' end learning_state,count(*) n from public.classroom_live_responses where session_id=p_session and is_correct is not null group by 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'status',status) order by created_at),'[]'::jsonb)
    into v_questions from public.classroom_live_questions where session_id=p_session and (v.state='complete' or status in ('open','recap'));
  return jsonb_build_object('ok',true,'session',to_jsonb(v),'participant_count',v_participants,'answered_count',v_answered,
    'answer_distribution',v_answers,'confidence_distribution',v_conf,'learning_states',v_states,'overall_learning_states',v_overall,'anonymous_questions',v_questions);
end $$;

revoke all on function public.classroom_live_create(uuid) from public;
revoke all on function public.classroom_live_join(uuid) from public;
revoke all on function public.classroom_live_find(uuid) from public;
revoke all on function public.classroom_live_control(uuid,text,jsonb) from public;
revoke all on function public.classroom_live_submit(uuid,jsonb,text) from public;
revoke all on function public.classroom_live_ask(uuid,text) from public;
revoke all on function public.classroom_live_question_action(uuid,uuid,text) from public;
revoke all on function public.classroom_live_learner_snapshot(uuid) from public;
revoke all on function public.classroom_live_leader_snapshot(uuid) from public;
grant execute on function public.classroom_live_create(uuid) to authenticated;
grant execute on function public.classroom_live_join(uuid) to authenticated;
grant execute on function public.classroom_live_find(uuid) to authenticated;
grant execute on function public.classroom_live_control(uuid,text,jsonb) to authenticated;
grant execute on function public.classroom_live_submit(uuid,jsonb,text) to authenticated;
grant execute on function public.classroom_live_ask(uuid,text) to authenticated;
grant execute on function public.classroom_live_question_action(uuid,uuid,text) to authenticated;
grant execute on function public.classroom_live_learner_snapshot(uuid) to authenticated;
grant execute on function public.classroom_live_leader_snapshot(uuid) to authenticated;
