-- AutoPrint OS — WhatsApp intake foundation (Phase 1)
-- This migration stores conversation/order metadata only. Actual document bytes remain outside Supabase.

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone_number text not null,
  provider text not null default 'meta_cloud_api',
  provider_phone_number_id text,
  status text not null default 'pending' check (status in ('pending','connected','disconnected','error')),
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shop_id),
  unique(provider_phone_number_id)
);

create table if not exists public.whatsapp_customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  whatsapp_number text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shop_id, whatsapp_number)
);

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.whatsapp_customers(id) on delete cascade,
  status text not null default 'active' check (status in ('active','waiting','completed','blocked')),
  current_step text not null default 'collecting_details',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_one_active_conversation
  on public.whatsapp_conversations(customer_id) where status in ('active','waiting');

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  text_body text,
  provider_media_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider_message_id)
);

create table if not exists public.whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.whatsapp_customers(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  status text not null default 'collecting_details'
    check (status in ('collecting_details','document_received','ready_for_quote','quoted','paid','queued','printing','printed_ready','completed','cancelled','failed')),
  intake_step text not null default 'awaiting_document',
  customer_name text,
  copies integer,
  color_mode text check (color_mode in ('bw','color')),
  paper_size text,
  sides text check (sides in ('single','double')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.whatsapp_orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.whatsapp_customers(id) on delete cascade,
  provider_media_id text,
  document_name text,
  mime_type text,
  size_bytes bigint,
  local_file_id text,
  intake_status text not null default 'received'
    check (intake_status in ('received','awaiting_desktop_import','available_locally','rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_orders_shop_status_idx on public.whatsapp_orders(shop_id,status);
create index if not exists whatsapp_documents_order_idx on public.whatsapp_documents(order_id);
create index if not exists whatsapp_messages_conversation_idx on public.whatsapp_messages(conversation_id,created_at desc);

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_customers enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_orders enable row level security;
alter table public.whatsapp_documents enable row level security;

drop policy if exists "shop members manage whatsapp connections" on public.whatsapp_connections;
create policy "shop members manage whatsapp connections" on public.whatsapp_connections
for all using (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_connections.shop_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_connections.shop_id and m.user_id = auth.uid()));

drop policy if exists "shop members read whatsapp customers" on public.whatsapp_customers;
create policy "shop members read whatsapp customers" on public.whatsapp_customers
for select using (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_customers.shop_id and m.user_id = auth.uid()));

drop policy if exists "shop members manage whatsapp conversations" on public.whatsapp_conversations;
create policy "shop members manage whatsapp conversations" on public.whatsapp_conversations
for all using (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_conversations.shop_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_conversations.shop_id and m.user_id = auth.uid()));

drop policy if exists "shop members read whatsapp messages" on public.whatsapp_messages;
create policy "shop members read whatsapp messages" on public.whatsapp_messages
for select using (exists (
  select 1 from public.whatsapp_conversations c
  join public.shop_members m on m.shop_id = c.shop_id
  where c.id = whatsapp_messages.conversation_id and m.user_id = auth.uid()
));

drop policy if exists "shop members manage whatsapp orders" on public.whatsapp_orders;
create policy "shop members manage whatsapp orders" on public.whatsapp_orders
for all using (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_orders.shop_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_orders.shop_id and m.user_id = auth.uid()));

drop policy if exists "shop members read whatsapp documents" on public.whatsapp_documents;
create policy "shop members read whatsapp documents" on public.whatsapp_documents
for select using (exists (select 1 from public.shop_members m where m.shop_id = whatsapp_documents.shop_id and m.user_id = auth.uid()));

create or replace function public.touch_whatsapp_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists whatsapp_connections_touch on public.whatsapp_connections;
create trigger whatsapp_connections_touch before update on public.whatsapp_connections
for each row execute function public.touch_whatsapp_updated_at();

drop trigger if exists whatsapp_customers_touch on public.whatsapp_customers;
create trigger whatsapp_customers_touch before update on public.whatsapp_customers
for each row execute function public.touch_whatsapp_updated_at();

drop trigger if exists whatsapp_conversations_touch on public.whatsapp_conversations;
create trigger whatsapp_conversations_touch before update on public.whatsapp_conversations
for each row execute function public.touch_whatsapp_updated_at();

drop trigger if exists whatsapp_orders_touch on public.whatsapp_orders;
create trigger whatsapp_orders_touch before update on public.whatsapp_orders
for each row execute function public.touch_whatsapp_updated_at();
