-- Bridge confirmed WhatsApp orders into the desktop print queue.
alter table if exists public.print_jobs
  add column if not exists source_whatsapp_order_id uuid;

create unique index if not exists print_jobs_source_whatsapp_order_uq
  on public.print_jobs(source_whatsapp_order_id)
  where source_whatsapp_order_id is not null;
