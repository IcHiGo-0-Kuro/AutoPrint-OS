import { db, getStoredSession, refreshSession } from './supabase';
import { getLocalFilePath } from './localStore';
import { PrintJob, PrinterDevice, ShopProfile } from '../types';

const money = (value: unknown) => Number(value ?? 0);
const formatSize = (bytes: unknown) => { const n = Number(bytes ?? 0); if (!n) return '—'; if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; };

function uiJobStatus(status: string, hardcopy: string): PrintJob['jobStatus'] {
  if (status === 'printing') return 'printing';
  if (status === 'queued') return 'queued';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
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
async function resolveLocalFilePath(row: any): Promise<string> {
  if (window.autoPrintNative && row.local_file_id) {
    const record = await window.autoPrintNative.files.resolve(row.local_file_id);
    return record?.path || '';
  }
  return getLocalFilePath(row.id);
}

function mapJob(row: any, printer: any, filePath: string): PrintJob {
  return {
    id: row.id, localFileId: row.local_file_id || undefined, tokenNumber: row.print_token || row.token_number || `JOB-${row.id.slice(0, 6).toUpperCase()}`, shortNumber: row.short_number || undefined, customerName: row.customer_name || 'Customer', customerPhone: row.customer_phone || '',
    fileName: row.document_name || row.local_file_name || 'Document', fileSize: formatSize(row.document_size_bytes), fileType: ((row.document_mime_type || '').split('/').pop() || 'pdf') as PrintJob['fileType'],
    localFilePath: filePath, pageCount: Number(row.document_page_count || row.pages_per_copy || 1), copies: Number(row.copies || row.print_count || 1),
    colorMode: row.color_mode === 'color' ? 'color' : 'bw', duplex: row.sides === 'double' ? 'duplex' : 'single', pagesPerSide: (row.pages_per_side || 1) as PrintJob['pagesPerSide'], orientation: row.orientation || 'portrait', pageRange: row.page_range || 'all',
    printCost: money(row.price), platformFee: money(row.platform_fee), totalAmount: money(row.total_amount || row.price), paymentStatus: row.payment === 'paid' ? 'paid' : row.payment === 'refunded' ? 'refunded' : 'unpaid',
    paymentMethod: row.payment_method || undefined, paymentTxnId: row.payment_transaction_id || undefined, jobStatus: uiJobStatus(row.status, row.hardcopy_status),
    printerId: row.printer_id || '', printerName: printer?.printer_name || 'Unassigned', currentPagePrinting: row.current_page_printing || undefined, totalPagesToPrint: Number(row.total_pages_to_print || row.document_page_count || 1),
    traySlot: row.tray_slot || '', headerStamped: row.header_stamped ?? true, separatorSheetIncluded: row.separator_sheet_included ?? true, isStapled: Boolean(row.is_stapled), notes: row.notes || undefined,
    createdAt: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), printedAt: row.printed_at ? new Date(row.printed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
  };
}
export async function registerCurrentDevice(shopId: string) {
  const session = getStoredSession();
  if (!session) throw new Error('Not signed in.');
  if (!window.autoPrintNative) throw new Error('Native desktop agent is not active.');

  const info = await window.autoPrintNative.system.info();
  if (!info.deviceId) throw new Error('Native desktop agent did not provide a device ID.');

  const deviceName = info.hostname || 'AutoPrint Desktop';
  const rows = await db<any[]>('/rpc/register_shop_device', {
    method: 'POST',
    body: JSON.stringify({
      p_shop_id: shopId,
      p_device_key: info.deviceId,
      p_device_name: deviceName,
    }),
  }, session);

  const device = Array.isArray(rows) ? rows[0] : rows;
  if (!device?.id) throw new Error('Device registration returned no device record.');
  return device;
}

export async function loadShopMemberships(): Promise<Array<{ shopId: string; shopName: string; role: string }>> {
  const session = getStoredSession();
  if (!session) throw new Error('Please sign in to AutoPrint OS.');
  const memberships = await db<any[]>(`/shop_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=shop_id,role&order=created_at.asc`, {}, session);
  if (!memberships.length) return [];
  const shopIds = memberships.map((membership) => membership.shop_id).filter(Boolean);
  const shops = await db<any[]>(`/shops?id=in.(${shopIds.join(',')})&select=id,name`, {}, session);
  const names = new Map(shops.map((shop) => [shop.id, shop.name]));
  return memberships
    .filter((membership) => names.has(membership.shop_id))
    .map((membership) => ({ shopId: membership.shop_id, shopName: names.get(membership.shop_id) || 'Shop', role: membership.role }));
}

export async function loadWorkspace(shopId?: string): Promise<{ shop: ShopProfile; printers: PrinterDevice[]; jobs: PrintJob[] }> {
  const session = getStoredSession(); if (!session) throw new Error('Please sign in to AutoPrint OS.');
  const memberships = await db<any[]>(`/shop_members?user_id=eq.${encodeURIComponent(session.user.id)}&select=shop_id,role&order=created_at.asc`, {}, session);
  if (!memberships.length) throw new Error('Your account is not assigned to a shop yet. Create or join a shop first.');
  const selectedMembership = shopId ? memberships.find((membership) => membership.shop_id === shopId) : memberships[0];
  if (!selectedMembership) throw new Error('You do not have access to that shop.');
  const activeShopId = selectedMembership.shop_id;
  const [shops, settingsRows, printerRows, statusRows, jobRows] = await Promise.all([
    db<any[]>(`/shops?id=eq.${activeShopId}&select=*`, {}, session), db<any[]>(`/shop_settings?shop_id=eq.${activeShopId}&select=*`, {}, session),
    db<any[]>(`/printers?shop_id=eq.${activeShopId}&select=*`, {}, session), db<any[]>(`/printer_status?select=*`, {}, session),
    db<any[]>(`/print_jobs?shop_id=eq.${activeShopId}&select=*&order=created_at.desc&limit=500`, {}, session)
  ]);
  const shop = shops[0]; if (!shop) throw new Error('Shop record not found.');
  const s = settingsRows[0] || {};
  const profile: ShopProfile = {
    id: shop.id, shopName: shop.name, ownerName: s.owner_name || '', collegeCampus: s.college_campus || '', city: s.city || '', whatsappNumber: s.whatsapp_number || '', upiVpa: s.upi_vpa || '', isWhatsAppConnected: Boolean(s.whatsapp_connected),
    rates: { bwSingle: money(s.bw_single), bwDuplex: money(s.bw_duplex), colorSingle: money(s.color_single), colorDuplex: money(s.color_duplex) },
    automationSettings: { autoSpoolEnabled: s.auto_spool_enabled ?? true, headerStampEnabled: s.header_stamp_enabled ?? true, headerStampFontSize: Number(s.header_stamp_font_size ?? 8), headerStampFormat: s.header_stamp_format || 'AutoPrint Token #{TOKEN} · {CUSTOMER_NAME} · {PHONE_LAST4}', separatorSheetEnabled: s.separator_sheet_enabled ?? true, autoNotifyOnComplete: s.auto_notify_on_complete ?? true, soundAlerts: s.sound_alerts ?? true },
    subscription: { plan: 'pro', status: 'active', nextBillingDate: '', prepaidWalletBalance: 0, lifetimePlatformFeePaid: 0, totalOrdersHandled: jobRows.length }
  };
  const defaultPrinter = printerRows.find(p => p.is_active !== false && String(p.status || '').toLowerCase() !== 'offline') || printerRows[0];
  const jobs = await Promise.all(jobRows.map(async (job) => mapJob(job, printerRows.find(p => p.id === job.printer_id) || defaultPrinter, await resolveLocalFilePath(job))));
  return { shop: profile, printers: printerRows.map(p => mapPrinter(p, statusRows.find(st => st.printer_id === p.id))), jobs };
}
export async function syncWhatsAppDocuments() {
  const session = getStoredSession();
  if (!session) return { imported: 0, failed: 0, documents: [] as any[] };
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined || 'https://ngdbwujpfbsgzfwfmddq.supabase.co').replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined || 'sb_publishable_tKjMe7fU3yBzn3HwdbbNuw_W8xzdqv1';
  const headers = { apikey: key, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
  const listResponse = await fetch(base + '/functions/v1/whatsapp-media-sync', { method: 'POST', headers, body: JSON.stringify({ action: 'list' }) });
  const listData = await listResponse.json();
  if (!listResponse.ok) throw new Error(listData?.error || 'Could not load WhatsApp documents.');
  const imported: any[] = [];
  let failed = 0;
  const nativeFiles = (window.autoPrintNative?.files as any);
  if (!nativeFiles?.importRemote) throw new Error('Native desktop document importer is not available.');
  for (const document of listData.documents || []) {
    try {
      const fileName = decodeURIComponent(encodeURIComponent(document.document_name || 'whatsapp-document'));
      const importedFile = await nativeFiles.importRemote({
        url: base + '/functions/v1/whatsapp-media-sync',
        fileName,
        expectedSize: Number(document.size_bytes || 0),
        token: session.access_token,
        body: { action: 'download', document_id: document.id },
      });
      const deviceId = (await window.autoPrintNative?.system.info())?.deviceId || null;
      const ackResponse = await fetch(base + '/functions/v1/whatsapp-media-sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'ack', document_id: document.id, local_file_id: importedFile.localFileId, device_id: deviceId }),
      });
      if (!ackResponse.ok) throw new Error('Document was downloaded but could not be acknowledged.');
      imported.push({ ...document, local_file_id: importedFile.localFileId, path: importedFile.path });
    } catch (error) {
      failed += 1;
      console.error('WhatsApp document import failed', document.id, error);
    }
  }
  return { imported: imported.length, failed, documents: imported };
}

export async function notifyNoPrinter(documentId: string) {
  const session = getStoredSession();
  if (!session) throw new Error('Not signed in.');
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined || 'https://ngdbwujpfbsgzfwfmddq.supabase.co').replace(/\/$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined || 'sb_publishable_tKjMe7fU3yBzn3HwdbbNuw_W8xzdqv1';
  const response = await fetch(base + '/functions/v1/whatsapp-media-sync', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'notify_no_printer', document_id: documentId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not notify the customer about the missing printer.');
  return data;
}
export async function reconcileNativePrintQueue(jobs: PrintJob[], autoSpoolEnabled: boolean) {
  if (!window.autoPrintNative) return;
  const nativeQueue = await window.autoPrintNative.print.queue();
  const nativeById = new Map(nativeQueue.map((item) => [item.id, item]));
  const updates: Array<{ id: string; status: PrintJob['jobStatus'] }> = [];

  for (const job of jobs) {
    const native = nativeById.get(job.id);
    if (native?.status === 'completed' && job.jobStatus !== 'printed_ready') {
      updates.push({ id: job.id, status: 'printed_ready' });
      continue;
    }
    if (native?.status === 'failed' && job.jobStatus !== 'cancelled') {
      updates.push({ id: job.id, status: 'failed' });
      continue;
    }
    if (autoSpoolEnabled && job.jobStatus === 'queued' && job.localFileId && job.printerName && !native) {
      try {
        await enqueueNativePrint(job);
      } catch {
        // Leave the cloud job queued so a transient desktop/file problem can be retried.
      }
    }
  }

  await Promise.all(updates.map((update) => updateJobStatus(update.id, update.status)));
  return { updates, nativeQueue };
}

export async function enqueueNativePrint(job: PrintJob) {
  if (!window.autoPrintNative) throw new Error('Native desktop agent is not active.');
  if (!job.localFileId) throw new Error('This job has no native local file ID.');
  if (!job.printerName) throw new Error('This job has no printer assigned.');
  return window.autoPrintNative.print.enqueue({
    jobId: job.id,
    localFileId: job.localFileId,
    printerName: job.printerName,
    copies: job.copies,
    shortNumber: job.shortNumber,
    printToken: job.tokenNumber,
    headerStampEnabled: job.headerStamped !== false,
    separatorSheetEnabled: job.separatorSheetIncluded !== false,
  });
}

export async function updateJobStatus(jobId: string, status: PrintJob['jobStatus']) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: dbJobStatus(status), updated_at: now };
  if (status === 'printed_ready') { patch.hardcopy_status = 'ready'; patch.printed_at = now; }
  if (status === 'completed') { patch.hardcopy_status = 'collected'; patch.completed_at = now; }
  await db(`/print_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }, session);
}
export async function updateStapled(jobId: string, value: boolean) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  await db(`/print_jobs?id=eq.${jobId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_stapled: value, updated_at: new Date().toISOString() }) }, session);
}
export async function addPrinter(shopId: string, printer: PrinterDevice) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  await db('/printers', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ shop_id: shopId, user_id: session.user.id, printer_name: printer.name, brand: printer.brand, model: printer.model, connection_type: printer.connectionType, ip_or_port: printer.ipOrPort, supported_modes: printer.supportedModes, status: printer.status, paper_tray_sheets: printer.paperTraySheets, toner_level_percent: printer.tonerLevelPercent, is_active: true }) }, session);
}
export async function saveSettings(shop: ShopProfile) {
  const session = getStoredSession(); if (!session) throw new Error('Not signed in.');
  const row = { shop_id: shop.id, owner_name: shop.ownerName, college_campus: shop.collegeCampus, city: shop.city, whatsapp_number: shop.whatsappNumber, upi_vpa: shop.upiVpa, whatsapp_connected: shop.isWhatsAppConnected, bw_single: shop.rates.bwSingle, bw_duplex: shop.rates.bwDuplex, color_single: shop.rates.colorSingle, color_duplex: shop.rates.colorDuplex, auto_spool_enabled: shop.automationSettings.autoSpoolEnabled, header_stamp_enabled: shop.automationSettings.headerStampEnabled, header_stamp_font_size: shop.automationSettings.headerStampFontSize, header_stamp_format: shop.automationSettings.headerStampFormat, separator_sheet_enabled: shop.automationSettings.separatorSheetEnabled, auto_notify_on_complete: shop.automationSettings.autoNotifyOnComplete, sound_alerts: shop.automationSettings.soundAlerts };
  await db('/shop_settings?on_conflict=shop_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) }, session);
}
export async function createShop(
  name: string,
  city: string,
  campus: string,
  ownerName: string,
  whatsappNumber: string,
  selectedPrinters: Array<{ name: string; driver: string; port: string; offline: boolean }>
) {
  // Shop creation uses a SECURITY DEFINER RPC so the initial INSERT is not
  // blocked by the shops table's strict owner_id RLS policy. Refresh first so
  // auth.uid() is evaluated from a current access token.
  const storedSession = getStoredSession();
  if (!storedSession) throw new Error('Not signed in.');
  const session = await refreshSession();
  const shop = await db<any>('/rpc/create_shop_for_current_user', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ p_name: name })
  }, session);
  if (!shop?.id) throw new Error('Shop creation returned no shop.');

  await db('/shop_members', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ shop_id: shop.id, user_id: session.user.id, role: 'owner' })
  }, session);

  await db('/shop_settings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      shop_id: shop.id,
      owner_name: ownerName,
      city,
      college_campus: campus,
      whatsapp_number: whatsappNumber,
      whatsapp_connected: true,
      auto_spool_enabled: true,
      header_stamp_enabled: true,
      header_stamp_font_size: 7,
      header_stamp_format: 'Printomatic #{SHORT_NUMBER}',
      separator_sheet_enabled: true,
      auto_notify_on_complete: true,
      sound_alerts: true
    })
  }, session);

  for (const [index, printer] of selectedPrinters.entries()) {
    await addPrinter(shop.id, {
      id: `printer_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + index}`,
      name: printer.name,
      brand: printer.driver || 'Windows',
      model: '',
      connectionType: 'NETWORK_LAN',
      ipOrPort: printer.port || '',
      supportedModes: ['bw', 'color'],
      status: printer.offline ? 'offline' : 'ready',
      paperTraySheets: 0,
      tonerLevelPercent: 100,
    });
  }
}
