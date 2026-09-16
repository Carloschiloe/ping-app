-- M-7 SemanticTurn V4: preserve user-expressed READ meaning without adding
-- canonical identities, retrieval evidence, authorization, or execution data.
alter table public.agent_turn_semantic_checkpoints
    drop constraint if exists agent_turn_semantic_checkpoints_semantic_version_check;
alter table public.agent_turn_semantic_checkpoints
    add constraint agent_turn_semantic_checkpoints_semantic_version_check
    check (semantic_version in (1, 2, 3, 4));
