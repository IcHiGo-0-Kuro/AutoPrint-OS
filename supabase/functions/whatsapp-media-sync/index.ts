import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsAppProvider } from "./provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 50 * 1024 * 1024;
const META_GRAPH_VERSION = "v23.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearer(request: Request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function getUserShopIds(admin: any, userId: string) {
  const { data, error } = await admin
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify shop membership.");
  return (data || []).map((row: any) => row.shop_id).filter(Boolean);
}

async function getDocument(admin: any, documentId: string, shopIds: string[]) {
  if (!documentId || !shopIds.length) return null;
  const { data, error } = await admin
    .from("whatsapp_documents")
    .select("id,order_id,shop_id,provider_media_id,document_name,mime_type,size_bytes,intake_status,media_download_status")
    .eq("id", documentId)
    .in("shop_id", shopIds)
    .maybeSingle();
  if (error) throw new Error("Could not load the WhatsApp document.");
  return data;
}

async function resolveMetaMedia(mediaId: string, accessToken: string) {
  const meta = await fetch("https://graph.facebook.com/" + META_GRAPH_VERSION + "/" + encodeURIComponent(mediaId), {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const data = await meta.json().catch(() => ({}));
  if (!meta.ok || !data?.url) throw new Error("WhatsApp media could not be resolved.");
  return data;
}

async function markFailed(admin: any, documentId: string, message: string) {
  await admin.from("whatsapp_documents").update({
    media_download_status: "failed",
    metadata: { transport_error: message.slice(0, 500), transport_failed_at: new Date().toISOString() },
  }).eq("id", documentId);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST required." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const whatsappAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server is not configured." }, 500);

  const accessToken = getBearer(request);
  if (!accessToken) return json({ error: "Authentication required." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }

  const shopIds = await getUserShopIds(admin, userData.user.id);
  if (!shopIds.length) return json({ error: "No shop membership found." }, 403);

  const action = body?.action;

  if (action === "list") {
    const { data, error } = await admin
      .from("whatsapp_documents")
      .select("id,order_id,shop_id,document_name,mime_type,size_bytes,provider_media_id,intake_status,media_download_status,created_at")
      .in("shop_id", shopIds)
      .eq("intake_status", "awaiting_desktop_import")
      .in("media_download_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(25);
    if (error) return json({ error: "Could not load pending documents." }, 500);
    return json({ documents: data || [] });
  }

  if (action === "ack") {
    const documentId = String(body?.document_id || "");
    const document = await getDocument(admin, documentId, shopIds);
    if (!document) return json({ error: "Document not found." }, 404);
    const localFileId = String(body?.local_file_id || "");
    if (!localFileId) return json({ error: "local_file_id is required." }, 400);
    const { error } = await admin.from("whatsapp_documents").update({
      local_file_id: localFileId,
      intake_status: "available_locally",
      media_download_status: "available_locally",
      media_downloaded_at: new Date().toISOString(),
      metadata: { local_device_id: body?.device_id ? String(body.device_id) : null },
    }).eq("id", documentId);
    if (error) return json({ error: "Could not acknowledge the local document." }, 500);

    const { data: order, error: orderError } = await admin.from("whatsapp_orders")
      .select("id,shop_id,status,intake_step,customer_name,customer_phone,copies,color_mode,paper_size,sides,page_count,amount,payment_status,token_number,short_number")
      .eq("id", document.order_id).maybeSingle();
    if (orderError) return json({ error: "Could not load the WhatsApp order." }, 500);

    let printJobId = null;
    let printJob = null;
    const detailsComplete = order && order.intake_step === "awaiting_desktop_import";
    if (order && detailsComplete) {
      const { data: existing } = await admin.from("print_jobs")
        .select("id")
        .eq("source_whatsapp_order_id", order.id)
        .maybeSingle();

      if (existing) {
        printJobId = existing.id;
      } else {
        const { data: member } = await admin.from("shop_members")
          .select("user_id")
          .eq("shop_id", order.shop_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const { data: printer } = await admin.from("printers")
          .select("id")
          .eq("shop_id", order.shop_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const { data: maxRow } = await admin.from("print_jobs")
          .select("queue_number")
          .eq("shop_id", order.shop_id)
          .order("queue_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!member?.user_id) return json({ error: "No shop member is available to own the print job." }, 500);

        const copies = Math.max(1, Math.min(999, Number(order.copies) || 1));
        const pageCount = Math.max(1, Number(order.page_count) || 1);
        const { data: job, error: jobError } = await admin.from("print_jobs").insert({
          user_id: member.user_id,
          created_by: member.user_id,
          shop_id: order.shop_id,
          printer_id: printer?.id || null,
          document_name: document.document_name,
          queue_number: Number(maxRow?.queue_number || 0) + 1,
          print_count: copies,
          copies,
          color_mode: order.color_mode === "color" ? "color" : "black_white",
          orientation: "portrait",
          pages_per_copy: pageCount,
          sides: order.sides === "double" ? "double" : "single",
          skip_pages: [],
          price: 0,
          payment: "pending",
          status: "queued",
          hardcopy_status: "not_required",
          local_file_id: localFileId,
          local_file_name: document.document_name,
          document_size_bytes: document.size_bytes,
          document_mime_type: document.mime_type,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone || null,
          token_number: order.token_number,
          short_number: order.short_number,
          header_stamped: true,
          separator_sheet_included: true,
          total_pages_to_print: pageCount * copies,
          source_whatsapp_order_id: order.id,
          notes: "WhatsApp Agent MVP order. Payment is disabled for this working model.",
        }).select("*").single();
        if (jobError) return json({ error: "Could not create the print job: " + jobError.message }, 500);
        printJobId = job.id;
        printJob = job;
        await admin.from("whatsapp_orders").update({
          status: "queued",
          intake_step: "queued",
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);
      }
    }

    if (!printJob && printJobId) {
      const { data: existingJob } = await admin.from("print_jobs").select("*").eq("id", printJobId).maybeSingle();
      printJob = existingJob;
    }

  }

  if (action === "notify_no_printer") {
    const documentId = String(body?.document_id || "");
    const document = await getDocument(admin, documentId, shopIds);
    if (!document) return json({ error: "Document not found." }, 404);

    const { data: order, error: orderError } = await admin
      .from("whatsapp_orders")
      .select("id,customer_id,short_number")
      .eq("id", document.order_id)
      .maybeSingle();
    if (orderError || !order) return json({ error: "WhatsApp order not found." }, 404);

    const { data: customer } = await admin
      .from("whatsapp_customers")
      .select("whatsapp_number")
      .eq("id", order.customer_id)
      .maybeSingle();

    const { data: connection } = await admin
      .from("whatsapp_connections")
      .select("provider_phone_number_id")
      .eq("shop_id", document.shop_id)
      .eq("status", "connected")
      .maybeSingle();

    if (!customer?.whatsapp_number || !connection?.provider_phone_number_id) {
      return json({ error: "WhatsApp connection is not ready for this shop." }, 409);
    }

    const provider = getWhatsAppProvider();
    const sent = await provider.sendText(
      connection.provider_phone_number_id,
      customer.whatsapp_number,
      "No printer detected. Opening your document on the shop computer now."
    );
    if (!sent) return json({ error: "Could not send the WhatsApp printer notice." }, 502);

    return json({ ok: true, notified: true, short_number: order.short_number || null });
  }

  if (action === "download") {
    const documentId = String(body?.document_id || "");
    const document = await getDocument(admin, documentId, shopIds);
    if (!document || !document.provider_media_id) return json({ error: "Document is not available for download." }, 404);
    if (!whatsappAccessToken) return json({ error: "WhatsApp media access is not configured on the server." }, 500);

    try {
      await admin.from("whatsapp_documents").update({ media_download_status: "downloading" }).eq("id", documentId);
      const media = await resolveMetaMedia(document.provider_media_id, whatsappAccessToken);
      const upstream = await fetch(media.url, { headers: { Authorization: "Bearer " + whatsappAccessToken } });
      if (!upstream.ok) throw new Error("WhatsApp media download failed.");
      const length = Number(upstream.headers.get("content-length") || 0);
      if (length > MAX_BYTES || Number(document.size_bytes || 0) > MAX_BYTES) throw new Error("Document exceeds the 50 MB desktop limit.");
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) throw new Error("Document exceeds the 50 MB desktop limit.");

      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": document.mime_type || media.mime_type || "application/octet-stream",
          "Content-Length": String(bytes.byteLength),
          "X-Printomatic-Document-Id": document.id,
          "X-Printomatic-Order-Id": document.order_id,
          "X-Printomatic-File-Name": encodeURIComponent(document.document_name || "whatsapp-document"),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media download failed.";
      await markFailed(admin, documentId, message);
      return json({ error: message }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
});
