-- M-7: let PostgREST's authenticator load this service-role-only RPC into
-- its schema cache. The effective execution grant remains service_role only.
grant execute on function public.admit_agent_turn_with_routing_mode(uuid, text, text, text, text)
    to authenticator;

notify pgrst, 'reload schema';
