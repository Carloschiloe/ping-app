-- Ensure every staging Auth identity has its canonical public profile.
-- This migration is additive: it does not infer a name and does not replace
-- existing profile data.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgrelid = 'auth.users'::regclass
          and tgname = 'on_auth_user_created'
          and not tgisinternal
    ) then
        create trigger on_auth_user_created
            after insert on auth.users
            for each row execute procedure public.handle_new_user();
    end if;
end;
$$;

insert into public.profiles (id, email)
select users.id, users.email
from auth.users as users
where not exists (
    select 1
    from public.profiles as profiles
    where profiles.id = users.id
);

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

commit;
