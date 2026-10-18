-- Phase 4: move Calendar integration metadata behind the canonical Commitment boundary.
-- This preserves the integration fields in commitments.meta while making the
-- update atomic with CommitmentEvent and CommitmentAudit evidence.

create or replace function public.update_commitment_integration_metadata_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid,
    p_integration text,
    p_metadata jsonb
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_before public.commitments;
    v_after public.commitments;
    v_patch jsonb;
    v_keys text[];
begin
    if p_integration <> 'calendar' then
        raise exception 'Unsupported Commitment integration'
            using errcode = '22023';
    end if;

    if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
        raise exception 'Integration metadata must be an object'
            using errcode = '22023';
    end if;

    select array_agg(key order by key)
      into v_keys
      from jsonb_object_keys(p_metadata) as key
     where key not in (
        'synced_to',
        'cloud_event_id',
        'external_event_url',
        'conflict_detected',
        'sync_status',
        'last_sync_at'
     );

    if v_keys is not null then
        raise exception 'Unsupported integration metadata field: %', v_keys[1]
            using errcode = '22023';
    end if;

    v_patch := jsonb_strip_nulls(jsonb_build_object(
        'synced_to', p_metadata->'synced_to',
        'cloud_event_id', p_metadata->'cloud_event_id',
        'external_event_url', p_metadata->'external_event_url',
        'conflict_detected', p_metadata->'conflict_detected',
        'sync_status', p_metadata->'sync_status',
        'last_sync_at', p_metadata->'last_sync_at'
    ));

    if v_patch = '{}'::jsonb then
        raise exception 'Integration metadata cannot be empty'
            using errcode = '22023';
    end if;

    select *
      into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found'
            using errcode = 'P0002';
    end if;

    if v_before.owner_user_id <> p_actor_user_id then
        raise exception 'Only the commitment owner can update integration metadata'
            using errcode = '42501';
    end if;

    update public.commitments
       set meta = coalesce(v_before.meta, '{}'::jsonb) || v_patch,
           updated_at = now()
     where id = p_commitment_id
     returning * into v_after;

    insert into public.commitment_events (
        commitment_id,
        actor_user_id,
        event_type,
        previous_status,
        new_status,
        payload
    ) values (
        v_after.id,
        p_actor_user_id,
        'edited',
        v_before.status,
        v_after.status,
        jsonb_build_object(
            'integration', p_integration,
            'metadata', v_patch
        )
    );

    insert into public.commitment_audit_records (
        commitment_id,
        proposal_id,
        actor_user_id,
        evidence_kind,
        action,
        previous_state,
        resulting_state,
        payload
    ) values (
        v_after.id,
        v_after.proposal_id,
        p_actor_user_id,
        'confirmed',
        'commitment_integration_metadata_updated',
        v_before.status,
        v_after.status,
        jsonb_build_object(
            'integration', p_integration,
            'metadata', v_patch
        )
    );

    return v_after;
end;
$$;

revoke all on function public.update_commitment_integration_metadata_with_evidence(uuid, uuid, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.update_commitment_integration_metadata_with_evidence(uuid, uuid, text, jsonb)
    to service_role;

comment on function public.update_commitment_integration_metadata_with_evidence(uuid, uuid, text, jsonb) is
    'Updates allowlisted external integration metadata and atomically records CommitmentEvent and CommitmentAudit evidence.';
