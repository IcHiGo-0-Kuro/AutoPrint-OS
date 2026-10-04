import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const metaToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const MAX_BYTES = 50 * 1024 * 1024;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function safeName(value: string) {
  const name = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return name.slice(0, 160) || "document";
}

async function getUser(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function userShopIds(userId: string) {
  const { data, error } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((row: any) => row.shop_id).filter(Boolean);
}

async function fetchMetaMedia(mediaId: string) {
  if (!metaToken) throw new Error("WhatsApp access token is not configured.");
  const metaResponse = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${metaToken}` },
  });
  if (!metaResponse.ok) throw new Error("Could not resolve the WhatsApp media URL.");
  const media = await metaResponse.json();
  if (!media?.url) throw new Error("WhatsApp media did not provide a download URL.");
  return media;
}

async function handleDownload(documentId: string, shopIds: string[]) {
  const { data: document, error } = await supabase
    .from("whatsapp_documents")
    .select("id,shop_id,order_id,provider_media_id,document_name,mime_type,size_bytes,intake_status,media_download_status,metadata")
    .eq("id", documentId)
    .in("shop_id", shopIds)
    .maybeSingle();

  if (error) throw error;
  if (!document) return json({ ok: false, error: "Document not found." }, 404);
  if (!document.provider_media_id) return json({ ok: false, error: "Document has no WhatsApp media ID." }, 409);
  if (document.media_download_status === "available_locally") {
    return json({ ok: true, already_available: true, document_id: document.id });
  }

  await supabase.from("whatsapp_documents").update({
    media_download_status: "downloading",
    intake_status: "awaiting_desktop_import",
  }).eq("id", document.id);

  try {
    const media = await fetchMetaMedia(document.provider_media_id);
    const expectedSize = Number(media.file_size || document.size_bytes || 0);
    if (expectedSize > MAX_BYTES) throw new Error("Document exceeds the 50 MB desktop handoff limit.");

    const response = await fetch(media.url, {
      headers: { Authorization: `Bearer ${metaToken}` },
    });
    if (!response.ok) throw new Error("WhatsApp media download failed.");

    const contentLength = Number(response.headers.get("content-length") || expectedSize || 0);
    if (contentLength > MAX_BYTES) throw new Error("Document exceeds the 50 MB desktop handoff limit.");

    const contentType = media.mime_type || document.mime_type || response.headers.get("content-type") || "application/octet-stream";
    const name = safeName(document.document_name || `whatsapp-${document.id}`);

    await supabase.from("whatsapp_documents").update({
      media_download_status: "pending",
      metadata: {
        ...(document.metadata || {}),
        resolved_mime_type: contentType,
        resolved_size_bytes: contentLength || null,
      },
    }).eq("id", document.id);

    const headers = {
      ...cors,
      "content-type": contentType,
      "content-disposition": `attachment; filename="${name}"`,
      "x-printomatic-document-id": document.id,
      "x-printomatic-order-id": document.order_id,
      "x-printomatic-file-name": encodeURIComponent(name),
    };
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    await supabase.from("whatsapp_documents").update({
      media_download_status: "failed",
      metadata: {
        ...(document.metadata || {}),
        last_download_error: error instanceof Error ? error.message : "Media handoff failed.",
      },
    }).eq("id", document.id);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  try {
    const user = await getUser(request);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const shopIds = await userShopIds(user.id);
    if (!shopIds.length) return json({ ok: false, error: "No shop membership found." }, 403);

    const body = await request.json().catch(() => ({}));
    if (body.action === "list") {
      const { data, error } = await supabase
        .from("whatsapp_documents")
        .select("id,shop_id,order_id,document_name,mime_type,size_bytes,intake_status,media_download_status,created_at")
        .in("shop_id", shopIds)
        .eq("intake_status", "awaiting_desktop_import")
        .in("media_download_status", ["pending", "failed"])
        .order("created_at", { ascending: true })
        .limit(25);
      if (error) throw error;
      return json({ ok: true, documents: data || [] });
    }

    if (body.action === "download" && typeof body.document_id === "string") {
      return await handleDownload(body.document_id, shopIds);
    }

    if (body.action === "ack" && typeof body.document_id === "string" && typeof body.local_file_id === "string") {
      const { data: document, error: lookupError } = await supabase
        .from("whatsapp_documents")
        .select("id,shop_id")
        .eq("id", body.document_id)
        .in("shop_id", shopIds)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!document) return json({ ok: false, error: "Document not found." }, 404);

      const { error } = await supabase.from("whatsapp_documents").update({
        local_file_id: body.local_file_id,
        intake_status: "available_locally",
        media_download_status: "available_locally",
        media_downloaded_at: new Date().toISOString(),
        metadata: { local_device_id: body.device_id || null },
      }).eq("id", body.document_id);
      if (error) throw error;
      return json({ ok: true, document_id: body.document_id, local_file_id: body.local_file_id });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    console.error("whatsapp-media-sync failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Media handoff failed." }, 500);
  }
});
