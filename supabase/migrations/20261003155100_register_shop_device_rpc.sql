-- AutoPrint OS: authenticated desktop device registration
-- This RPC keeps staff users from receiving direct write access to shop_devices.
-- It only permits authenticated members of the target shop to register/refresh
-- their desktop identity and only writes the controlled device fields.

create or replace function public.register_shop_device(
  p_shop_id uuid,
  p_device_key text,
  p_device_name text
)
returns public.shop_devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.shop_devices;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_shop_id is null or p_device_key is null or length(trim(p_device_key)) = 0 then
    raise exception 'Shop and device identity are required';
  end if;

  if not exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this shop';
  end if;

  insert into public.shop_devices (
    shop_id,
    device_key,
    device_name,
    device_type,
    is_active,
    is_online,
    last_seen_at
  )
  values (
    p_shop_id,
    trim(p_device_key),
    coalesce(nullif(trim(p_device_name), ''), 'AutoPrint Desktop'),
    'desktop',
    true,
    true,
    now()
  )
  on conflict (shop_id, device_key)
  do update set
    device_name = excluded.device_name,
    device_type = 'desktop',
    is_online = true,
    last_seen_at = now(),
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.register_shop_device(uuid, text, text) from public, anon;
grant execute on function public.register_shop_device(uuid, text, text) to authenticated;
