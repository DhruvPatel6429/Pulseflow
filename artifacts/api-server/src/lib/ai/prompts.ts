/**
 * AI Layer — Prompt Templates & Tone Helpers
 *
 * All reply copy lives here, not scattered across route files.
 * Swappable for LLM-generated replies in the future — just replace
 * the buildReply* functions with OpenAI/Anthropic calls that use
 * the same signatures and BusinessContext/ServiceContext inputs.
 */

import type { BusinessContext, ServiceContext } from "./types";

export function greeting(tone: string): string {
  switch (tone) {
    case "premium": return "";
    case "warm": return "Hello! ";
    case "concise": return "";
    default: return "Hi! ";
  }
}

export function buildPriceReply(
  ctx: BusinessContext,
  service: ServiceContext
): string {
  const g = greeting(ctx.preferredTone);
  const consultation = service.requiresConsultation
    ? " This service requires a brief consultation — our team will confirm details."
    : "";
  const advance = service.requiresTokenAdvance
    ? ` A token advance is required for booking.`
    : "";
  return `${g}${service.name} is ₹${service.price} and takes about ${service.durationMinutes} minutes.${consultation}${advance} Would you like to book an appointment?`;
}

export function buildServiceListReply(
  ctx: BusinessContext,
  services: ServiceContext[]
): string {
  const g = greeting(ctx.preferredTone);
  const list = services.slice(0, 6).map((s) => `• ${s.name} — ₹${s.price}`).join("\n");
  return `${g}Here are some of our services at ${ctx.name}:\n${list}\n\nWhich service are you interested in?`;
}

export function buildAvailabilityReply(
  ctx: BusinessContext,
  service: ServiceContext,
  dateLabel: string,
  slotTimes: string[]
): string {
  const g = greeting(ctx.preferredTone);
  const slots = slotTimes.join(", ");
  return `${g}${service.name} is ₹${service.price}. We have slots on ${dateLabel} at ${slots}. Which time works for you? 😊`;
}

export function buildNoSlotsReply(
  ctx: BusinessContext,
  service: ServiceContext,
  dateLabel: string
): string {
  const g = greeting(ctx.preferredTone);
  return `${g}Sorry, we don't have any available slots for ${service.name} on ${dateLabel}. Would you like to check another date? 🌸`;
}

export function buildBookingServiceUnknownReply(ctx: BusinessContext): string {
  const g = greeting(ctx.preferredTone);
  return `${g}Which service would you like to book? We offer haircut, facial, hair spa, and more. What works for you?`;
}

export function buildCancelReply(ctx: BusinessContext): string {
  const g = greeting(ctx.preferredTone);
  const policy = ctx.cancellationPolicy ?? "Please contact us for details";
  return `${g}I've noted your cancellation request. Our policy: ${policy}. Our team will confirm shortly. 🙏`;
}

export function buildRescheduleReply(ctx: BusinessContext): string {
  const g = greeting(ctx.preferredTone);
  return `${g}Sure! Please share your preferred new date and time and I'll check availability for you. 📅`;
}

export function buildLocationReply(ctx: BusinessContext): string {
  const g = greeting(ctx.preferredTone);
  const addr = ctx.address ?? "Please contact us for our address";
  const maps = ctx.googleMapsLink ? `\n📍 ${ctx.googleMapsLink}` : "";
  return `${g}We're located at: ${addr}${maps}`;
}

export function buildFallbackReply(ctx: BusinessContext): string {
  const g = greeting(ctx.preferredTone);
  return `${g}Thanks for reaching out to ${ctx.name}! How can we help? You can ask about our services, prices, availability, or book an appointment. 🌸`;
}
