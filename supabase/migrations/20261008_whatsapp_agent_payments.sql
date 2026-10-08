-- Printomatic WhatsApp Agent v1: pricing, payment state, and per-shop UPI configuration.
alter table public.whatsapp_connections
  add column if not exists waba_id text,
  add column if not exists business_account_id text;

alter table public.whatsapp_orders
  add column if not exists page_count integer,
  add column if not exists amount numeric(12,2),
  add column if not exists currency text not null default 'INR',
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','expired','failed')),
  add column if not exists payment_reference text,
  add column if not exists payment_qr_path text,
  add column if not exists quoted_at timestamptz,
  add column if not exists paid_at timestamptz;

create unique index if not exists whatsapp_orders_payment_reference_uq
  on public.whatsapp_orders(payment_reference)
  where payment_reference is not null;

alter table public.shop_settings
  add column if not exists whatsapp_upi_id text,
  add column if not exists whatsapp_upi_name text;

-- Keep payment/order transitions database-authoritative.
create index if not exists whatsapp_orders_payment_status_idx
  on public.whatsapp_orders(shop_id, payment_status, status);
