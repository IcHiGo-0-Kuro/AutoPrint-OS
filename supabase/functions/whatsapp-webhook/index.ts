import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9+]/g, "");
}

async function sendText(phoneNumberId: string, to: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  if (!token) return;
  const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!response.ok) console.error("WhatsApp send failed", await response.text());
}

function firstMessage(payload: any) {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      const metadata = value?.metadata;
      const message = value?.messages?.[0];
      if (message) return { message, metadata };
    }
  }
  return null;
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
    const payload = await request.json();
    const incoming = firstMessage(payload);
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
    const textBody = type === "text" ? message.text?.body || null : null;
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
      .select("id,intake_step,status")
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
        .select("id,intake_step,status")
        .single();
      if (created.error) throw created.error;
      order = created.data;
    }

    if (type === "document" || type === "image" || type === "video") {
      const documentName = media?.filename || `whatsapp-${message.id || crypto.randomUUID()}`;
      const doc = await supabase.from("whatsapp_documents").insert({
        order_id: order.id,
        shop_id: connection.shop_id,
        customer_id: customer.id,
        provider_media_id: media?.id || null,
        document_name: documentName,
        mime_type: media?.mime_type || null,
        size_bytes: media?.file_size || null,
        intake_status: "awaiting_desktop_import",
        metadata: { provider: "meta_cloud_api", message_id: message.id, sha256: media?.sha256 || null },
      }).select("id").single();
      if (doc.error) throw doc.error;

      await supabase.from("whatsapp_orders").update({
        status: "document_received",
        intake_step: "awaiting_print_options",
      }).eq("id", order.id);

      await supabase.from("whatsapp_conversations").update({
        current_step: "awaiting_print_options",
        last_message_at: new Date().toISOString(),
      }).eq("id", conversation.id);

      await sendText(
        phoneNumberId,
        customerNumber,
        "Document received. AutoPrint has saved your order. Next we’ll collect the print options.",
      );
    } else {
      await supabase.from("whatsapp_conversations").update({
        last_message_at: new Date().toISOString(),
      }).eq("id", conversation.id);
      await sendText(
        phoneNumberId,
        customerNumber,
        "Got it. Please send the document you want to print, then we’ll collect the print options.",
      );
    }

    return json({ ok: true, order_id: order.id });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
