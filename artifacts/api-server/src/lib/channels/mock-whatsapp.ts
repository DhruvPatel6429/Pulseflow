/**
 * Channels — Mock WhatsApp Sender
 *
 * Used in sandbox/development mode when WHATSAPP_ACCESS_TOKEN is not set.
 * Logs all messages — no real API calls made.
 *
 * Swap for the real sender in production by setting WHATSAPP_ACCESS_TOKEN.
 */

import type { OutboundMessage, MessageResult } from "./types";
import { logger } from "../logger";

export async function sendMockWhatsappMessage(msg: OutboundMessage): Promise<MessageResult> {
  logger.info(
    { to: msg.to, preview: msg.text.slice(0, 80) },
    "[WhatsApp sandbox] Message logged (not sent)"
  );
  return { ok: true, sandbox: true, messageId: `mock_${Date.now()}` };
}
