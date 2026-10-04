-- Printomatic secure WhatsApp -> desktop media handoff.
-- WhatsApp document bytes are not persisted in Supabase Storage.
-- The Edge Function retrieves the media from Meta only when an authenticated
-- shop desktop requests it, and the Electron client writes the bytes locally.

alter table if exists public.whatsapp_documents
  add column if not exists media_download_status text not null default 'pending'
    check (media_download_status in ('pending','downloading','available_locally','failed'));

alter table if exists public.whatsapp_documents
  add column if not exists media_sha256 text;

alter table if exists public.whatsapp_documents
  add column if not exists media_downloaded_at timestamptz;

create index if not exists whatsapp_documents_desktop_pending_idx
  on public.whatsapp_documents(shop_id, media_download_status, created_at)
  where intake_status = 'awaiting_desktop_import';

-- Keep the existing customer-facing status separate from the transport state.
update public.whatsapp_documents
set media_download_status = case
  when intake_status = 'available_locally' then 'available_locally'
  else 'pending'
end
where media_download_status is null;
