-- M-7 Semantic Turn V2: version the existing isolated checkpoint payload.
-- V1 rows remain readable as historical data, but are not silently promoted.
alter table public.agent_turn_semantic_checkpoints
    drop constraint if exists agent_turn_semantic_checkpoints_semantic_version_check;

alter table public.agent_turn_semantic_checkpoints
    add constraint agent_turn_semantic_checkpoints_semantic_version_check
    check (semantic_version in (1, 2));

comment on column public.agent_turn_semantic_checkpoints.semantic_version is
    'Versioned provider-neutral semantic facts. V1 is legacy; V2 is required for disposition mapping.';
