export type WhatsAppIncoming = {
  message: any;
  metadata: any;
};

export type WhatsAppProvider = {
  name: string;
  extractIncoming(payload: any): WhatsAppIncoming | null;
  sendText(phoneNumberId: string, to: string, body: string): Promise<boolean>;
  sendImage(phoneNumberId: string, to: string, imageUrl: string, caption?: string): Promise<boolean>;
};

function metaIncoming(payload: any): WhatsAppIncoming | null {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      const message = value?.messages?.[0];
      if (message) return { message, metadata: value?.metadata };
    }
  }
  return null;
}

function metaApiBase() {
  return `https://graph.facebook.com/${Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0"}`;
}

const metaCloudProvider: WhatsAppProvider = {
  name: "meta_cloud_api",
  extractIncoming: metaIncoming,
  async sendText(phoneNumberId, to, body) {
    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (!token) return false;

    const response = await fetch(`${metaApiBase()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });

    if (!response.ok) {
      console.error("WhatsApp provider send failed", await response.text());
      return false;
    }
    return true;
  },
  async sendImage(phoneNumberId, to, imageUrl, caption) {
    const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    if (!token) return false;

    const response = await fetch(`${metaApiBase()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl, ...(caption ? { caption } : {}) },
      }),
    });

    if (!response.ok) {
      console.error("WhatsApp provider image send failed", await response.text());
      return false;
    }
    return true;
  },
};

export function getWhatsAppProvider(): WhatsAppProvider {
  const configured = (Deno.env.get("WHATSAPP_PROVIDER") || "meta_cloud_api").toLowerCase();
  if (configured === "meta_cloud_api" || configured === "meta") return metaCloudProvider;
  throw new Error(`Unsupported WHATSAPP_PROVIDER: ${configured}`);
}
