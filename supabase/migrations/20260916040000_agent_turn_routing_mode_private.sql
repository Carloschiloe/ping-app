-- M-7: PostgREST schema discovery must not grant effective execution to
-- authenticator. Private backend PostgreSQL is the only admission transport.
revoke execute on function public.admit_agent_turn_with_routing_mode(uuid, text, text, text, text)
    from authenticator;

notify pgrst, 'reload schema';
