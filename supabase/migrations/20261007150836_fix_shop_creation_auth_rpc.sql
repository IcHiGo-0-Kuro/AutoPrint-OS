create or replace function public.create_shop_for_current_user(p_name text)
returns public.shops
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_shop public.shops;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Shop name is required';
  end if;

  insert into public.shops (name, owner_id)
  values (trim(p_name), v_user_id)
  returning * into v_shop;

  return v_shop;
end;
$$;

revoke execute on function public.create_shop_for_current_user(text) from anon;
grant execute on function public.create_shop_for_current_user(text) to authenticated;