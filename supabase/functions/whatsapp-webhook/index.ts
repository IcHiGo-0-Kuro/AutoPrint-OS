import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getWhatsAppProvider } from "./provider.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const whatsappProvider = getWhatsAppProvider();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeOption(value: string) {
  return value.toLowerCase().trim().replace(/[.,!?]/g, "");
}

function parsePositiveInt(value: string) {
  const match = value.match(/\d+/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999 ? parsed : null;
}

function parseColor(value: string): "bw" | "color" | null {
  const text = normalizeOption(value);
  if (["bw", "b&w", "black", "blackwhite", "blackandwhite", "mono", "monochrome"].includes(text)) return "bw";
  if (["color", "colour", "col"].includes(text)) return "color";
  return null;
}

function parsePaper(value: string): string | null {
  const text = normalizeOption(value).replace(/\s+/g, "");
  if (["a4", "a3", "a5", "letter", "legal"].includes(text)) return text.toUpperCase();
  return null;
}

function parseSides(value: string): "single" | "double" | null {
  const text = normalizeOption(value);
  if (["single", "oneside", "one", "1", "single-sided", "single-sided"].includes(text)) return "single";
  if (["double", "duplex", "both", "twoside", "two", "2", "double-sided"].includes(text)) return "double";
  return null;
}

async function verifyMetaSignature(rawBody: string, signature: string) {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET") || "";
  if (!secret || !signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const suppliedHex = signature.slice(7).trim().toLowerCase();
  const supplied = suppliedHex.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) || [];
  if (supplied.length !== mac.length) return false;
  let mismatch = 0;
  for (let i = 0; i < mac.length; i++) mismatch |= mac[i] ^ supplied[i];
  return mismatch === 0;
}

async function sendProviderText(phoneNumberId: string, to: string, body: string, conversationId?: string) {
  const sent = await whatsappProvider.sendText(phoneNumberId, to, body);
  if (!sent) return false;
  if (conversationId) {
    const result = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      message_type: "text",
      text_body: body,
      metadata: { provider: whatsappProvider.name },
    });
    if (result.error) console.error("Could not log outbound WhatsApp message", result.error);
  }
  return true;
}

async function sendProviderImage(phoneNumberId: string, to: string, imageUrl: string, caption: string, conversationId?: string) {
  const sent = await whatsappProvider.sendImage(phoneNumberId, to, imageUrl, caption);
  if (!sent) return false;
  if (conversationId) {
    const result = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      message_type: "image",
      text_body: caption,
      metadata: { provider: whatsappProvider.name, image_url: imageUrl },
    });
    if (result.error) console.error("Could not log outbound WhatsApp QR message", result.error);
  }
  return true;
}

async function sendNextQuestion(phoneNumberId: string, customerNumber: string, conversationId: string, step: string) {
  const prompts: Record<string, string> = {
    awaiting_document: "Please send the document you want to print (PDF, image, or supported file).",
    awaiting_name: "What name should we put on this order?",
    awaiting_copies: "How many copies do you need? Reply with a number, for example: 2",
    awaiting_color: "Print mode? Reply B&W or Color.",
    awaiting_paper: "Which paper size? Reply A4, A3, A5, Letter, or Legal.",
    awaiting_sides: "Single-sided or double-sided (duplex)?",
    awaiting_pages: "How many pages are in the document? Reply with a number.",
    awaiting_desktop_import: "Got it. Your print details are complete. I am preparing the document on the shop computer now.",
  };
  const body = prompts[step] || prompts.awaiting_document;
  await sendProviderText(phoneNumberId, customerNumber, body, conversationId);
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== verifyToken) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";
    if (!(await verifyMetaSignature(rawBody, signature))) {
      return json({ ok: false, error: "Invalid WhatsApp webhook signature." }, 401);
    }
    const payload = JSON.parse(rawBody);
    const incoming = whatsappProvider.extractIncoming(payload);
    if (!incoming) return json({ ok: true, ignored: true });

    const { message, metadata } = incoming;
    const phoneNumberId = metadata?.phone_number_id;
    const customerNumber = normalizePhone(message.from || "");
    if (!phoneNumberId || !customerNumber) return json({ ok: true, ignored: true });

    const { data: connection, error: connectionError } = await supabase
      .from("whatsapp_connections")
      .select("id,shop_id,phone_number,status")
      .eq("provider_phone_number_id", phoneNumberId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ ok: false, error: "unknown_whatsapp_number" }, 404);

    await supabase.from("whatsapp_connections")
      .update({ status: "connected", last_webhook_at: new Date().toISOString() })
      .eq("id", connection.id);

    const profileName = message.profile?.name || null;
    const { data: customer, error: customerError } = await supabase
      .from("whatsapp_customers")
      .upsert({
        shop_id: connection.shop_id,
        whatsapp_number: customerNumber,
        display_name: profileName,
      }, { onConflict: "shop_id,whatsapp_number" })
      .select("id,display_name")
      .single();
    if (customerError) throw customerError;

    let { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("id,current_step,status")
      .eq("customer_id", customer.id)
      .in("status", ["active", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      const created = await supabase.from("whatsapp_conversations")
        .insert({
          shop_id: connection.shop_id,
          customer_id: customer.id,
          status: "active",
          current_step: "awaiting_document",
          last_message_at: new Date().toISOString(),
        })
        .select("id,current_step,status")
        .single();
      if (created.error) throw created.error;
      conversation = created.data;
    }

    const { data: existingMessage } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("provider_message_id", message.id)
      .maybeSingle();
    if (existingMessage) return json({ ok: true, duplicate: true });

    const type = message.type || "text";
    const textBody = type === "text" ? cleanText(message.text?.body) : null;
    const media = ["document", "image", "video"].includes(type) ? message[type] : null;

    const insertedMessage = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      provider_message_id: message.id || null,
      direction: "inbound",
      message_type: type,
      text_body: textBody,
      provider_media_id: media?.id || null,
      metadata: message,
    });
    if (insertedMessage.error) throw insertedMessage.error;

    let { data: order } = await supabase
      .from("whatsapp_orders")
      .select("id,intake_step,status,customer_name,copies,color_mode,paper_size,sides,page_count,amount,payment_status,payment_reference,token_number,short_number")
      .eq("conversation_id", conversation.id)
      .in("status", ["collecting_details", "document_received", "ready_for_quote", "quoted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) {
      const created = await supabase.from("whatsapp_orders")
        .insert({
          shop_id: connection.shop_id,
          customer_id: customer.id,
          conversation_id: conversation.id,
          customer_name: customer.display_name,
          intake_step: "awaiting_document",
        })
        .select("id,intake_step,status,customer_name,copies,color_mode,paper_size,sides,token_number,short_number")
        .single();
      if (created.error) throw created.error;
      order = created.data;
    }

    // Guided order agent: collect the print specification first. Payment is intentionally
    // disabled for the working MVP; a completed specification becomes a desktop print job.
    let nextStep = conversation.current_step || order.intake_step || "awaiting_document";

    if (type === "document" || type === "image" || type === "video") {
      const documentName = media?.filename || `whatsapp-${message.id || crypto.randomUUID()}`;
      const { error: docError } = await supabase.from("whatsapp_documents").insert({
        order_id: order.id,
        shop_id: connection.shop_id,
        customer_id: customer.id,
        provider_media_id: media?.id || null,
        document_name: documentName,
        mime_type: media?.mime_type || null,
        size_bytes: media?.file_size || null,
        intake_status: "awaiting_desktop_import",
        metadata: { provider: whatsappProvider.name, message_id: message.id, sha256: media?.sha256 || null },
      });
      if (docError) throw docError;

      nextStep = order.customer_name ? "awaiting_copies" : "awaiting_name";
      await supabase.from("whatsapp_orders").update({
        status: "document_received",
        intake_step: nextStep,
      }).eq("id", order.id);
    } else if (type === "text" && textBody) {
      const normalized = normalizeOption(textBody);

      if (nextStep === "awaiting_document") {
        // Keep this deterministic: a text message alone never counts as a file.
        nextStep = "awaiting_document";
      } else if (nextStep === "awaiting_name") {
        if (textBody.length < 2 || textBody.length > 80) {
          await sendProviderText(phoneNumberId, customerNumber, "Please send the customer name (2–80 characters).", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({ customer_name: textBody, intake_step: "awaiting_copies" }).eq("id", order.id);
        nextStep = "awaiting_copies";
      } else if (nextStep === "awaiting_copies") {
        const copies = parsePositiveInt(textBody);
        if (!copies) {
          await sendProviderText(phoneNumberId, customerNumber, "Please reply with the number of copies, for example: 2", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({ copies, intake_step: "awaiting_color" }).eq("id", order.id);
        nextStep = "awaiting_color";
      } else if (nextStep === "awaiting_color") {
        const color = parseColor(textBody);
        if (!color) {
          await sendProviderText(phoneNumberId, customerNumber, "Please reply B&W or Color.", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({ color_mode: color, intake_step: "awaiting_paper" }).eq("id", order.id);
        nextStep = "awaiting_paper";
      } else if (nextStep === "awaiting_paper") {
        const paper = parsePaper(textBody);
        if (!paper) {
          await sendProviderText(phoneNumberId, customerNumber, "Please reply with A4, A3, A5, Letter, or Legal.", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({ paper_size: paper, intake_step: "awaiting_sides" }).eq("id", order.id);
        nextStep = "awaiting_sides";
      } else if (nextStep === "awaiting_sides") {
        const sides = parseSides(textBody);
        if (!sides) {
          await sendProviderText(phoneNumberId, customerNumber, "Please reply Single-sided or Double-sided.", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({ sides, intake_step: "awaiting_pages" }).eq("id", order.id);
        nextStep = "awaiting_pages";
      } else if (nextStep === "awaiting_pages") {
        const pageCount = parsePositiveInt(textBody);
        if (!pageCount) {
          await sendProviderText(phoneNumberId, customerNumber, "Please reply with the number of pages, for example: 6", conversation.id);
          return json({ ok: true, order_id: order.id, step: nextStep });
        }
        await supabase.from("whatsapp_orders").update({
          page_count: pageCount,
          status: "ready_for_quote",
          intake_step: "awaiting_desktop_import",
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);
        nextStep = "awaiting_desktop_import";
      }
    }

    await supabase.from("whatsapp_conversations").update({
      current_step: nextStep,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation.id);

    const refreshed = await supabase.from("whatsapp_orders")
      .select("customer_name,copies,color_mode,paper_size,sides,page_count,amount,payment_status,payment_reference,token_number,short_number")
      .eq("id", order.id)
      .single();
    if (refreshed.error) throw refreshed.error;

    await sendNextQuestion(phoneNumberId, customerNumber, conversation.id, nextStep);
    }

    return json({ ok: true, order_id: order.id, step: nextStep });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
