import { db, getStoredSession } from './supabase';
import { getLocalFilePath } from './localStore';
import { PrintJob, PrinterDevice, ShopProfile } from '../types';

const money = (value: unknown) => Number(value ?? 0);
const formatSize = (bytes: unknown) => { const n = Number(bytes ?? 0); if (!n) return '—'; if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; };

function uiJobStatus(status: string, hardcopy: string): PrintJob['jobStatus'] {
  if (status === 'printing') return 'printing';
  if (status === 'queued') return 'queued';
  if (status === 'cancelled' || status === 'failed') return 'cancelled';
  if (status === 'completed' && hardcopy !== 'collected') return 'printed_ready';
  return 'completed';
}
function dbJobStatus(status: PrintJob['jobStatus']) {
  if (status === 'printed_ready') return 'completed';
  if (status === 'spooling' || status === 'pending_quote' || status === 'pending_payment') return 'queued';
  return status === 'cancelled' ? 'cancelled' : status;
}
function mapPrinter(row: any, status?: any): PrinterDevice {
  const modes = Array.isArray(row.supported_modes) ? row.supported_modes : ['bw'];
  return { id: row.id, name: row.printer_name, brand: row.brand || 'Unknown', model: row.model || '', connectionType: row.connection_type || 'NETWORK_LAN', ipOrPort: row.ip_or_port || row.location || '', supportedModes: modes as PrinterDevice['supportedModes'], status: row.status || (status?.is_online ? 'ready' : 'offline'), paperTraySheets: Number(status?.a4_sheets_remaining ?? row.paper_tray_sheets ?? 0), tonerLevelPercent: Number(status?.ink_black_percent ?? row.toner_level_percent ?? 0), activeJobId: row.active_job_id || undefined };
}
function mapJob(row: any, printer?: any): PrintJob {
  const filePath = getLocalFilePath(row.id);
  return {
    id: row.id, tokenNumber: row.token_number || `JOB-${row.id.slice(0, 6).toUpperCase()}`, customerName: row.customer_name || 'Customer', customerPhone: row.customer_phone || '',
    fileName: row.document_name || row.local_file_name || 'Document', fileSize: formatSize(row.document_size_bytes), fileType: ((row.document_mime_type || '').split('/').pop() || 'pdf') as PrintJob['fileType'],
    localFilePath: filePath, pageCount: Number(row.document_page_count || row.pages_per_copy || 1), copies: Number(row.copies || row.print_count || 1),
    colorMode: row.color_mode === 'color' ? 'color' : 'bw', duplex: row.sides === 'double' ? 'duplex' : 'single', pagesPerSide: (row.pages_per_side || 1) as PrintJob['pagesPerSide'], orientation: row.orientation || 'portrait', pageRange: row.page_range || 'all',
    printCost: money(row.price), platformFee: money(row.platform_fee), totalAmount: money(row.total_amount || row.price), paymentStatus: row.payment === 'paid' ? 'paid' : row.payment === 'refunded' ? 'refunded' : 'unpaid',
    paymentMethod: row.payment_method || undefined, paymentTxnId: row.payment_transaction_id || undefined, jobStatus: uiJobStatus(row.status, row.hardcopy_status),
    printerId: row.printer_id || '', printerName: printer?.printer_name || 'Unassigned', currentPagePrinting: row.current_page_printing || undefined, totalPagesToPrint: Number(row.total_pages_to_print || row.document_page_count || 1),
    traySlot: row.tray_slot || '', headerStamped: Boolean(row.header_stamped), separatorSheetIncluded: Boolean(row.separator_sheet_included), isStapled: Boolean(row.is_stapled), notes: row.notes || undefined,
    createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), printedAt: row.printed_at ? new Date(row.printed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
  };
}
export async function loadWorkspace(): Promise<{ shop: ShopProfile; printers: PrinterDevice[]; jobs: PrintJob[] }> {
  const session = getStoredSession(); if (!session) throw new Error('Please sign in to AutoPrint OS.');
  const memberships = await db<any[]>(`/shop_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=shop_id,role&order=created_at.asc&limit=1`, {}, session);
  if (!memberships.length) throw new Error('Your account is not assigned to a shop yet. Create or join a shop first.');
  const shopId = memberships[0].shop_id;
  const [shops, settingsRows, printerRows, statusRows, jobRows] = await Promise.all([
    db<any[]>(`/shops?id=eq.${shopId}&select=*`, {}, session), db<any[]>(`/shop_settings?shop_id=eq.${shopId}&select=*`, {}, session),
    db<any[]>(`/printers?shop_id=eq.${shopId}&select=*`, {}, session), db<any[]>(`/printer_status?select=*`, {}, session),
    db<any[]>(`/print_jobs?shop_id=eq.${shopId}&select=*&order=created_at.desc&limit=500`, {}, session)
  ]);
  const shop = shops[0]; if (!shop) throw new Error('Shop record not found.');
  const s = settingsRows[0] || {};
  const profile: ShopProfile = {
    id: shop.id, shopName: shop.name, ownerName: s.owner_name || '', collegeCampus: s.college_campus || '', city: s.city || '', whatsappNumber: s.whatsapp_number || '', upiVpa: s.upi_vpa || '', isWhatsAppConnected: Boolean(s.whatsapp_connected),
    rates: { bwSingle: money(s.bw_single), bwDuplex: money(s.bw_duplex), colorSingle: money(s.color_single), colorDuplex: money(s.color_duplex) },
    automationSettings: { autoSpoolEnabled: s.auto_spool_enabled ?? true, headerStampEnabled: s.header_stamp_enabled ?? true, headerStampFontSize: Number(s.header_stamp_font_size ?? 8), headerStampFormat: s.header_stamp_format || 'AutoPrint Token #{TOKEN} · {CUSTOMER_NAME} · {PHONE_LAST4}', separatorSheetEnabled: s.separator_sheet_enabled ?? true, autoNotifyOnComplete: s.auto_notify_on_complete ?? true, soundAlerts: s.sound_alerts ?? true },
    subscription: { plan: 'pro', status: 'active', nextBillingDate: '', prepaidWalletBalance: 0, lifetimePlatformFeePaid: 0, totalOrdersHandled: jobRows.length }
  };
  return { shop: profile, printers: printerRows.map(p => mapPrinter(p, statusRows.find(st => st.printer_id === p.id))), jobs: jobRows.map(j => mapJob(j, printerRows.find(p => p.id === j.printer_id))) };
}
export async function updateJobStatus(jobId: string, status: PrintJob['jobStatus']) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  const patch: Record<string, unknown> = { status: dbJobStatus(status), updated_at: new Date().toISOString() };
  if (status === 'printed_ready') patch.hardcopy_status = 'ready'; if (status === 'completed') patch.hardcopy_status = 'collected';
  await db(`/print_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }, session);
}
export async function updateStapled(jobId: string, value: boolean) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  await db(`/print_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_stapled: value, updated_at: new Date().toISOString() }) }, session);
}
export async function addPrinter(shopId: string, printer: PrinterDevice) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  await db('/printers', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: printer.id, shop_id: shopId, user_id: session.user.id, printer_name: printer.name, brand: printer.brand, model: printer.model, connection_type: printer.connectionType, ip_or_port: printer.ipOrPort, supported_modes: printer.supportedModes, status: printer.status, paper_tray_sheets: printer.paperTraySheets, toner_level_percent: printer.tonerLevelPercent, is_active: true }) }, session);
}
export async function saveSettings(shop: ShopProfile) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  const row = { shop_id: shop.id, owner_name: shop.ownerName, college_campus: shop.collegeCampus, city: shop.city, whatsapp_number: shop.whatsappNumber, upi_vpa: shop.upiVpa, whatsapp_connected: shop.isWhatsAppConnected, bw_single: shop.rates.bwSingle, bw_duplex: shop.rates.bwDuplex, color_single: shop.rates.colorSingle, color_duplex: shop.rates.colorDuplex, auto_spool_enabled: shop.automationSettings.autoSpoolEnabled, header_stamp_enabled: shop.automationSettings.headerStampEnabled, header_stamp_font_size: shop.automationSettings.headerStampFontSize, header_stamp_format: shop.automationSettings.headerStampFormat, separator_sheet_enabled: shop.automationSettings.separatorSheetEnabled, auto_notify_on_complete: shop.automationSettings.autoNotifyOnComplete, sound_alerts: shop.automationSettings.soundAlerts };
  await db('/shop_settings?on_conflict=shop_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }, session);
}
export async function createShop(name: string, city: string, campus: string) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  const shops = await db<any[]>('/shops', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, owner_id: session.user.id }) }, session);
  const shop = shops[0]; if (!shop) throw new Error('Shop creation returned no shop.');
  await db('/shop_members', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ shop_id: shop.id, user_id: session.user.id, role: 'owner' }) }, session);
  await db('/shop_settings', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ shop_id: shop.id, city, college_campus: campus }) }, session);
}
