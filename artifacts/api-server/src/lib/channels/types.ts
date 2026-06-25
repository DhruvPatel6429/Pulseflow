/**
 * Channels — Shared Types
 *
 * Abstraction layer for outbound messaging channels.
 * Currently: WhatsApp Cloud API (with sandbox fallback).
 * Future: SMS, email, RCS.
 */

export interface OutboundMessage {
  to: string;       // E.164 phone number
  text: string;
}

export interface MessageResult {
  ok: boolean;
  messageId?: string;
  sandbox?: boolean;  // true when sent in mock/dev mode
  error?: string;
}
