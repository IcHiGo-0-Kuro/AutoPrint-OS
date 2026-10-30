-- Prevent shop members from changing their own role or membership identity.
drop policy if exists "Members can view shop membership" on public.shop_members;
create policy "Members can view shop membership"
on public.shop_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_shop_owner(shop_id)
);

drop policy if exists "Owners can update shop members" on public.shop_members;
create policy "Owners can update shop members"
on public.shop_members
for update
to authenticated
using (public.is_shop_owner(shop_id))
with check (public.is_shop_owner(shop_id));

drop policy if exists "Owners can remove shop members" on public.shop_members;
create policy "Owners can remove shop members"
on public.shop_members
for delete
to authenticated
using (public.is_shop_owner(shop_id));

create or replace function public.prevent_shop_membership_identity_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.shop_id is distinct from old.shop_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Shop membership identity cannot be changed';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_shop_membership_identity_change on public.shop_members;
create trigger prevent_shop_membership_identity_change
before update on public.shop_members
for each row
execute function public.prevent_shop_membership_identity_change();

revoke execute on function public.is_shop_owner(uuid) from public, anon;
grant execute on function public.is_shop_owner(uuid) to authenticated;
revoke execute on function public.create_shop_for_current_user(text) from public, anon;
grant execute on function public.create_shop_for_current_user(text) to authenticated;
