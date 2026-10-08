import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsAppProvider } from "../whatsapp-webhook/provider.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(raw: string, signature: string) {
  const secret = Deno.env.get("PRINTOMATIC_PAYMENT_WEBHOOK_SECRET") || "";
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const supplied = signature.replace(/^sha256=/, "").trim().toLowerCase();
  return timingSafeEqual(mac, new Uint8Array(supplied.match(/.{1,2}/g)?.map((x) => parseInt(x, 16)) || []));
}

async function ensurePaidPrintJob(order: any) {
  const { data: document } = await supabase.from("whatsapp_documents")
    .select("id,document_name,mime_type,size_bytes,local_file_id,intake_status")
    .eq("order_id", order.id)
    .eq("shop_id", order.shop_id)
    .eq("intake_status", "available_locally")
    .not("local_file_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!document?.local_file_id) return null;

  const { data: existing } = await supabase.from("print_jobs").select("id").eq("source_whatsapp_order_id", order.id).maybeSingle();
  if (existing) return existing.id;

  const { data: member } = await supabase.from("shop_members").select("user_id").eq("shop_id", order.shop_id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const { data: printer } = await supabase.from("printers").select("id").eq("shop_id", order.shop_id).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const { data: maxRow } = await supabase.from("print_jobs").select("queue_number").eq("shop_id", order.shop_id).order("queue_number", { ascending: false }).limit(1).maybeSingle();
  if (!member?.user_id) throw new Error("No shop member is available to own the print job.");

  const copies = Math.max(1, Math.min(999, Number(order.copies) || 1));
  const { data: job, error } = await supabase.from("print_jobs").insert({
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
    pages_per_copy: Number(order.page_count || 1),
    sides: order.sides === "double" ? "double" : "single",
    skip_pages: [],
    price: Number(order.amount || 0),
    payment: "paid",
    status: "queued",
    hardcopy_status: "not_required",
    local_file_id: document.local_file_id,
    local_file_name: document.document_name,
    document_size_bytes: document.size_bytes,
    document_mime_type: document.mime_type,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    token_number: order.token_number,
    short_number: order.short_number,
    header_stamped: true,
    separator_sheet_included: true,
    total_pages_to_print: Number(order.page_count || 1) * copies,
    source_whatsapp_order_id: order.id,
    notes: "WhatsApp Agent paid order.",
  }).select("id").single();
  if (error) throw error;

  await supabase.from("whatsapp_orders").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", order.id);
  return job.id;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required." }, 405);
  const raw = await request.text();
  const signature = request.headers.get("x-printomatic-signature") || "";
  if (!(await verifySignature(raw, signature))) return json({ error: "Invalid webhook signature." }, 401);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }

  const reference = String(body?.payment_reference || "").trim();
  const transactionId = String(body?.transaction_id || "").trim();
  const status = String(body?.status || "").toLowerCase();
  const amount = Number(body?.amount || 0);
  if (!reference || !transactionId || !amount || !["paid", "success", "captured"].includes(status)) {
    return json({ error: "Payment event is incomplete." }, 400);
  }

  const { data: order, error: orderError } = await supabase.from("whatsapp_orders")
    .select("id,shop_id,customer_id,customer_name,copies,color_mode,paper_size,sides,page_count,amount,currency,payment_status,payment_reference,token_number,short_number")
    .eq("payment_reference", reference)
    .maybeSingle();
  if (orderError) return json({ error: "Could not load payment order." }, 500);
  if (!order) return json({ error: "Unknown payment reference." }, 404);
  if (Number(order.amount || 0).toFixed(2) !== amount.toFixed(2)) return json({ error: "Payment amount mismatch." }, 409);
  if (order.payment_status === "paid") return json({ ok: true, duplicate: true, order_id: order.id });

  const { error: updateError } = await supabase.from("whatsapp_orders").update({
    payment_status: "paid",
    status: "paid",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: `Payment transaction ${transactionId}`,
  }).eq("id", order.id);
  if (updateError) return json({ error: "Could not mark order paid." }, 500);

  const jobId = await ensurePaidPrintJob(order);

  const { data: customer } = await supabase.from("whatsapp_customers").select("whatsapp_number").eq("id", order.customer_id).maybeSingle();
  const { data: connection } = await supabase.from("whatsapp_connections").select("provider_phone_number_id").eq("shop_id", order.shop_id).eq("status", "connected").maybeSingle();
  if (customer?.whatsapp_number && connection?.provider_phone_number_id) {
    const provider = getWhatsAppProvider();
    await provider.sendText(
      connection.provider_phone_number_id,
      customer.whatsapp_number,
      jobId
        ? `Payment received for order #${order.short_number || "----"}. Your paid print job is now in the Printomatic desktop queue.`
        : `Payment received for order #${order.short_number || "----"}. Your document will enter the desktop print queue as soon as the shop computer imports it.`,
    );
  }

  return json({ ok: true, order_id: order.id, print_job_id: jobId });
});
