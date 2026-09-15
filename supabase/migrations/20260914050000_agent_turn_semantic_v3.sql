-- M-7 SemanticTurn V3: structured temporal facts. V1/V2 meanings remain intact.
alter table public.agent_turn_semantic_checkpoints
    drop constraint if exists agent_turn_semantic_checkpoints_semantic_version_check;
alter table public.agent_turn_semantic_checkpoints
    add constraint agent_turn_semantic_checkpoints_semantic_version_check
    check (semantic_version in (1, 2, 3));
