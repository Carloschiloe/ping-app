-- PING — ARCHIVE LIFECYCLE COMPLETION: archive_commitment_with_evidence
-- (20260828160000_commitment_core_canonical_writes.sql) has no symmetric
-- counterpart -- a commitment that is archived can never be un-archived.
-- Archive is documented (and tested, commitmentService.test.ts) as a
-- visibility-only concern: it sets archived_at/updated_at and never
-- touches `status`. Restore must be exactly as narrow: it clears
-- archived_at only, using the identical owner-only authorization, row
-- lock, and Event/Audit evidence pattern already established by archive --
-- never a status transition, never a duplicate row, never a new
-- commitment.

-- commitment_events_type_check (widened for 'archived' in
-- 20260828160000_commitment_core_canonical_writes.sql) does not yet allow
-- 'restored' -- widened the same way, same append-only table, no other
-- change.
alter table public.commitment_events
    drop constraint if exists commitment_events_type_check;
alter table public.commitment_events
    add constraint commitment_events_type_check
        check (event_type in (
            'created', 'edited', 'archived', 'restored', 'accepted', 'rejected',
            'counter_proposed', 'rescheduled', 'action_completed', 'resolved',
            'reopened', 'cancelled', 'follow_up_scheduled', 'reassigned'
        ));

create or replace function public.restore_commitment_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_before public.commitments;
    v_after public.commitments;
begin
    select * into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found' using errcode = 'P0002';
    end if;
    if v_before.owner_user_id <> p_actor_user_id then
        raise exception 'Only the commitment owner can restore it'
            using errcode = '42501';
    end if;
    if v_before.archived_at is null then
        raise exception 'Commitment is not archived' using errcode = 'P0001';
    end if;

    update public.commitments
       set archived_at = null,
           updated_at = now()
     where id = p_commitment_id
     returning * into v_after;

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        p_commitment_id, p_actor_user_id, 'restored',
        v_before.status, v_after.status,
        jsonb_build_object(
            'proposal_id', v_after.proposal_id,
            'source_message_id', v_after.message_id,
            'archived_at', v_after.archived_at
        )
    );

    insert into public.commitment_audit_records (
        commitment_id, proposal_id, actor_user_id, evidence_kind,
        action, previous_state, resulting_state, payload
    ) values (
        p_commitment_id, v_after.proposal_id, p_actor_user_id, 'confirmed',
        'commitment_restored', v_before.status, v_after.status,
        jsonb_build_object('archived_at', v_after.archived_at)
    );

    return v_after;
end;
$$;

revoke all on function public.restore_commitment_with_evidence(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.restore_commitment_with_evidence(uuid, uuid)
    to service_role;

comment on function public.restore_commitment_with_evidence(uuid, uuid) is
    'Clears archived_at on a Commitment (restores visibility only, never touches status) and atomically records Event and Audit evidence.';
