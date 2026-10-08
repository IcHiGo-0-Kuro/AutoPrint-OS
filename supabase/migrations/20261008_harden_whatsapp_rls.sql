-- Harden WhatsApp shop data policies to signed-in users only.
alter policy "shop members manage whatsapp connections" on public.whatsapp_connections to authenticated;
alter policy "shop members read whatsapp customers" on public.whatsapp_customers to authenticated;
alter policy "shop members manage whatsapp conversations" on public.whatsapp_conversations to authenticated;
alter policy "shop members read whatsapp messages" on public.whatsapp_messages to authenticated;
alter policy "shop members manage whatsapp orders" on public.whatsapp_orders to authenticated;
alter policy "shop members read whatsapp documents" on public.whatsapp_documents to authenticated;

-- SECURITY DEFINER helpers are intentionally callable by authenticated users
-- where the application/RLS path needs them. Anonymous callers do not need them.
revoke execute on function public.create_shop_for_current_user(text) from anon;
revoke execute on function public.is_shop_owner(uuid) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.register_shop_device(uuid, text, text) from anon;
