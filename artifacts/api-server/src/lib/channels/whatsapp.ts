/**
 * Channels — WhatsApp Cloud API Client
 *
 * Auto-detects sandbox mode:
 *   - If WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set → real sends
 *   - Otherwise → mock/sandbox mode (logs only, no API calls)
 *
 * Production upgrade: no code changes needed — just set the env vars.
 *
 * WhatsApp Cloud API docs:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
 */

import type { OutboundMessage, MessageResult } from "./types";
import { sendMockWhatsappMessage } from "./mock-whatsapp";
import { logger } from "../logger";

const ACCESS_TOKEN = process.env["WHATSAPP_ACCESS_TOKEN"];
const PHONE_NUMBER_ID = process.env["WHATSAPP_PHONE_NUMBER_ID"];
const API_VERSION = "v19.0";

export async function sendWhatsappMessage(msg: OutboundMessage): Promise<MessageResult> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    return sendMockWhatsappMessage(msg);
  }

  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: msg.to.replace(/\D/g, ""),  // strip non-digits
      type: "text",
      text: { body: msg.text },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      logger.error({ status: resp.status, err: errText, to: msg.to }, "WhatsApp send failed");
      return { ok: false, error: errText };
    }

    const data = (await resp.json()) as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id;
    logger.info({ to: msg.to, messageId }, "WhatsApp message sent");
    return { ok: true, messageId };
  } catch (e) {
    logger.error({ e, to: msg.to }, "WhatsApp send error");
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Re-export for convenience
export { sendMockWhatsappMessage };
