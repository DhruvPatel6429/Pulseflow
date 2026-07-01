/**
 * WhatsApp Cloud API integration layer.
 *
 * Architecture: provider adapter pattern. The WhatsappService interface
 * normalizes inbound webhooks and outbound sends so the app logic
 * never touches transport details.
 *
 * To go live with Meta WhatsApp Cloud API:
 *   1. Set WHATSAPP_ACCESS_TOKEN env var (permanent system-user token from Meta Business Manager)
 *   2. Set WHATSAPP_PHONE_NUMBER_ID env var (from WhatsApp Cloud API setup)
 *   3. Set WHATSAPP_VERIFY_TOKEN in the business settings (used for webhook verification)
 *   4. Point your Meta App webhook URL to POST /api/webhooks/whatsapp
 *
 * In development/sandbox mode (default), messages are processed locally
 * without hitting the real WhatsApp API.
 */

import { logger } from "./logger";

export interface NormalizedInboundMessage {
  from: string;  // phone number
  messageId: string;
  text: string;
  timestamp: number;
  customerName?: string;
}

export interface OutboundMessage {
  to: string;
  text: string;
}

import { sendWhatsappMessage as sendWhatsappMessageChannel } from "./channels/whatsapp";

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SANDBOX_MODE = !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID;

export function isSandboxMode(): boolean {
  return SANDBOX_MODE;
}

/**
 * Parse a Meta WhatsApp Cloud API webhook payload into a normalized message.
 * Returns null if the payload doesn't contain a text message.
 */
export function parseWebhookPayload(body: Record<string, unknown>): NormalizedInboundMessage | null {
  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
    const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
    const value = changes?.value as Record<string, unknown>;
    const messages = (value?.messages as Array<Record<string, unknown>>)?.[0];
    const contacts = (value?.contacts as Array<Record<string, unknown>>)?.[0];

    if (!messages || messages.type !== "text") return null;

    return {
      from: String(messages.from),
      messageId: String(messages.id),
      text: String((messages.text as Record<string, string>)?.body ?? ""),
      timestamp: Number(messages.timestamp) * 1000,
      customerName: String((contacts?.profile as Record<string, string>)?.name ?? ""),
    };
  } catch (e) {
    logger.warn({ e }, "Failed to parse WhatsApp webhook payload");
    return null;
  }
}

/**
 * Send a WhatsApp message via Meta Cloud API.
 * In sandbox mode, logs the message instead.
 */
export async function sendWhatsappMessage(msg: OutboundMessage): Promise<void> {
  const result = await sendWhatsappMessageChannel(msg);
  if (!result.ok) {
    throw new Error(result.error || "WhatsApp send failed");
  }
}
