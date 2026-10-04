-- Printomatic identification and print-pipeline metadata.
-- Adds human-friendly pickup IDs while keeping the long token as the durable identifier.

create sequence if not exists public.printomatic_short_number_seq;

alter table if exists public.whatsapp_orders
  add column if not exists token_number text,
  add column if not exists short_number text;

alter table if exists public.print_jobs
  add column if not exists short_number text,
  add column if not exists print_token text,
  add column if not exists identification_status text not null default 'pending'
    check (identification_status in ('pending','applied','not_applicable','failed'));

create unique index if not exists whatsapp_orders_shop_short_number_uq
  on public.whatsapp_orders(shop_id, short_number)
  where short_number is not null;

create unique index if not exists whatsapp_orders_token_uq
  on public.whatsapp_orders(token_number)
  where token_number is not null;

create unique index if not exists print_jobs_shop_short_number_uq
  on public.print_jobs(shop_id, short_number)
  where short_number is not null;

create unique index if not exists print_jobs_print_token_uq
  on public.print_jobs(print_token)
  where print_token is not null;

create or replace function public.assign_printomatic_identity()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.token_number is null or btrim(new.token_number) = '' then
    new.token_number := 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;

  if new.short_number is null or btrim(new.short_number) = '' then
    loop
      candidate := lpad((nextval('public.printomatic_short_number_seq') % 10000)::text, 4, '0');
      exit when not exists (
        select 1
        from public.whatsapp_orders o
        where o.shop_id = new.shop_id
          and o.short_number = candidate
      );
    end loop;
    new.short_number := candidate;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_orders_assign_printomatic_identity on public.whatsapp_orders;
create trigger whatsapp_orders_assign_printomatic_identity
before insert on public.whatsapp_orders
for each row execute function public.assign_printomatic_identity();

create or replace function public.assign_print_job_identity()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.print_token is null or btrim(new.print_token) = '' then
    new.print_token := coalesce(new.token_number, 'PM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
  end if;

  if new.short_number is null or btrim(new.short_number) = '' then
    loop
      candidate := lpad((nextval('public.printomatic_short_number_seq') % 10000)::text, 4, '0');
      exit when not exists (
        select 1
        from public.print_jobs j
        where j.shop_id = new.shop_id
          and j.short_number = candidate
      );
    end loop;
    new.short_number := candidate;
  end if;

  return new;
end;
$$;

drop trigger if exists print_jobs_assign_printomatic_identity on public.print_jobs;
create trigger print_jobs_assign_printomatic_identity
before insert on public.print_jobs
for each row execute function public.assign_print_job_identity();
