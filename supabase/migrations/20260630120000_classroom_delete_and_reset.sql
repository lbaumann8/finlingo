-- ============================================================================
-- Finlingo Classroom — safe delete-group + full user-data reset
-- ----------------------------------------------------------------------------
-- Adds two SECURITY DEFINER RPCs on top of 20260629000000_classroom.sql:
--
--   classroom_delete_group(p_classroom_id uuid)
--     Leader-only. Permanently deletes ONE group the caller owns, plus all of
--     its dependent rows (assignments, learner memberships, attempts,
--     responses). Verifies auth.uid() owns the classroom before deleting.
--
--   classroom_reset_user_data()
--     Deletes EVERY classroom row tied to the calling user:
--       * groups the user OWNS (and all their dependent data), and
--       * the user's own learner footprint (memberships / attempts / responses)
--         inside groups owned by other leaders.
--     Used by the client "Reset account data" flow before it signs the user out.
--
-- Both functions run as a single plpgsql transaction (all-or-nothing). Each one
-- deletes children explicitly in FK-safe order even though the schema already
-- declares ON DELETE CASCADE from public.classrooms — the explicit deletes keep
-- the behavior correct and auditable even if a future migration loosens those
-- cascades, and they make the privacy guarantee (no orphaned learner rows) plain.
--
-- EXECUTE is revoked from PUBLIC and granted only to `authenticated`: an
-- unauthenticated caller has no auth.uid() and could never pass the owner check
-- anyway, but we make the boundary explicit. A learner or a different leader
-- calling classroom_delete_group on a group they don't own gets {ok:false,
-- error:'forbidden'} and zero rows are touched.
--
-- This is a NEW migration — it does not edit 20260629000000_classroom.sql.
-- Run it in Supabase (SQL editor or `supabase db push`) before the new
-- delete/reset UI works end-to-end.
-- ============================================================================

-- ── RPC: leader deletes one group they own ─────────────────────────────────
create or replace function public.classroom_delete_group(p_classroom_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Authoritative ownership check. SECURITY DEFINER bypasses RLS, so we gate
  -- the whole operation on owner_id = auth.uid() right here.
  select owner_id into v_owner
  from public.classrooms
  where id = p_classroom_id;

  if v_owner is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Children first (deepest dependency → shallowest), then the group itself.
  delete from public.classroom_responses   where classroom_id = p_classroom_id;
  delete from public.classroom_attempts     where classroom_id = p_classroom_id;
  delete from public.classroom_assignments  where classroom_id = p_classroom_id;
  delete from public.classroom_members      where classroom_id = p_classroom_id;
  delete from public.classrooms             where id = p_classroom_id and owner_id = auth.uid();

  return jsonb_build_object('ok', true, 'classroom_id', p_classroom_id);
end;
$$;

-- ── RPC: wipe ALL classroom data belonging to the calling user ─────────────
create or replace function public.classroom_reset_user_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_groups integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- 1. The user's LEARNER footprint in groups owned by OTHER leaders. Delete
  --    responses, then attempts, then memberships (children → parent).
  delete from public.classroom_responses r
  using public.classroom_attempts a, public.classroom_members m
  where r.attempt_id = a.id
    and a.member_id = m.id
    and m.user_id = v_uid;

  delete from public.classroom_attempts a
  using public.classroom_members m
  where a.member_id = m.id
    and m.user_id = v_uid;

  delete from public.classroom_members
  where user_id = v_uid;

  -- 2. Groups the user OWNS. Deleting the classrooms cascades to any remaining
  --    assignments/attempts/responses/members from OTHER learners in those
  --    groups (the children are still deleted explicitly first for clarity).
  delete from public.classroom_responses   where classroom_id in (select id from public.classrooms where owner_id = v_uid);
  delete from public.classroom_attempts     where classroom_id in (select id from public.classrooms where owner_id = v_uid);
  delete from public.classroom_assignments  where classroom_id in (select id from public.classrooms where owner_id = v_uid);
  delete from public.classroom_members      where classroom_id in (select id from public.classrooms where owner_id = v_uid);

  with deleted as (
    delete from public.classrooms where owner_id = v_uid returning 1
  )
  select count(*) into v_groups from deleted;

  return jsonb_build_object('ok', true, 'deleted_groups', v_groups);
end;
$$;

-- ── Grants: authenticated only ─────────────────────────────────────────────
revoke all on function public.classroom_delete_group(uuid)   from public;
revoke all on function public.classroom_reset_user_data()     from public;
grant execute on function public.classroom_delete_group(uuid) to authenticated;
grant execute on function public.classroom_reset_user_data()  to authenticated;
