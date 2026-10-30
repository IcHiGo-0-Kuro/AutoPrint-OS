-- Pin search paths for trigger functions and remove direct RPC access
-- to functions intended only for triggers/event triggers.
alter function public.set_updated_at() set search_path = pg_catalog;
alter function public.validate_skip_pages() set search_path = pg_catalog;
alter function public.set_shop_devices_updated_at() set search_path = pg_catalog;
alter function public.touch_whatsapp_updated_at() set search_path = pg_catalog;
alter function public.assign_printomatic_identity() set search_path = pg_catalog, public;
alter function public.assign_print_job_identity() set search_path = pg_catalog, public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
