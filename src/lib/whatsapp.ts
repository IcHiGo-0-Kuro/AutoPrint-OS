import { db, getStoredSession } from './supabase';

export type WhatsAppConnection = {
  id: string;
  shop_id: string;
  phone_number: string;
  provider: string;
  provider_phone_number_id?: string | null;
  status: 'pending' | 'connected' | 'disconnected' | 'error';
  last_webhook_at?: string | null;
};

export async function getWhatsAppConnection(shopId: string) {
  const session = getStoredSession();
  if (!session) throw new Error('Not signed in.');
  const rows = await db<WhatsAppConnection[]>(
    `/whatsapp_connections?shop_id=eq.${encodeURIComponent(shopId)}&select=*&limit=1`,
    {},
    session,
  );
  return rows[0] || null;
}

export async function saveWhatsAppConnection(shopId: string, phoneNumber: string) {
  const session = getStoredSession();
  if (!session) throw new Error('Not signed in.');
  const normalized = phoneNumber.replace(/[^0-9+]/g, '');
  if (normalized.length < 8) throw new Error('Enter a valid WhatsApp number including the country code.');

  const rows = await db<WhatsAppConnection[]>(
    '/whatsapp_connections?on_conflict=shop_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        shop_id: shopId,
        phone_number: normalized,
        provider: 'meta_cloud_api',
        status: 'pending',
      }),
    },
    session,
  );
  const connection = rows[0];
  if (!connection) throw new Error('WhatsApp connection was not saved.');
  return connection;
}
