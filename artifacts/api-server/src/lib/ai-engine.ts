import { db } from "@workspace/db";
import { businessesTable, servicesTable, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getAvailableSlots } from "./booking-engine";

export interface AIIntentResult {
  intent:
    | "price_inquiry"
    | "availability_inquiry"
    | "booking_request"
    | "reschedule_request"
    | "cancel_request"
    | "location_inquiry"
    | "faq"
    | "unknown";
  confidence: number;
  extractedEntities: {
    serviceName?: string;
    requestedDate?: string;
    requestedTime?: string;
    customerName?: string;
  };
  actionSuggestion: {
    shouldReply: boolean;
    shouldCreatePendingBooking: boolean;
    shouldAskFollowUpQuestion: boolean;
    shouldEscalateToOwner: boolean;
  };
  replyDraft: string;
  availableSlots?: Array<{ startTime: string; endTime: string; available: boolean }>;
  matchedService?: {
    id: number;
    name: string;
    price: number | string;
    durationMinutes: number;
  };
}

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function matchService(message: string, services: Array<{ id: number; name: string; price: string | number; durationMinutes: number }>): typeof services[0] | undefined {
  const lower = message.toLowerCase();
  return services.find((s) => lower.includes(s.name.toLowerCase().split(" ")[0]));
}

function extractDate(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("tomorrow")) return getTomorrowDate();
  if (lower.includes("today")) return new Date().toISOString().slice(0, 10);

  // Try to parse "24 jun", "june 24", etc.
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  for (const [abbr, idx] of Object.entries(months)) {
    const re = new RegExp(`(\\d{1,2})\\s*${abbr}|${abbr}\\s*(\\d{1,2})`, "i");
    const m = message.match(re);
    if (m) {
      const day = parseInt(m[1] || m[2], 10);
      const year = new Date().getFullYear();
      return new Date(year, idx, day).toISOString().slice(0, 10);
    }
  }
  return getTomorrowDate();
}

function extractTime(message: string): string | undefined {
  const timeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  const m = message.match(timeRe);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridian = m[3].toLowerCase();
  if (meridian === "pm" && h !== 12) h += 12;
  if (meridian === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function classifyIntent(message: string): { intent: AIIntentResult["intent"]; confidence: number } {
  const lower = message.toLowerCase();

  const bookingKeywords = ["book", "appointment", "slot", "schedule", "available", "availability", "can i get", "want to", "free"];
  const priceKeywords = ["price", "cost", "charge", "rate", "how much", "fee", "₹", "rs", "rupee"];
  const rescheduleKeywords = ["reschedule", "change", "move", "shift", "postpone", "different time", "different day"];
  const cancelKeywords = ["cancel", "cancell", "not coming", "can't come", "won't come"];
  const locationKeywords = ["where", "location", "address", "direction", "map", "place"];

  if (cancelKeywords.some((k) => lower.includes(k))) return { intent: "cancel_request", confidence: 0.9 };
  if (rescheduleKeywords.some((k) => lower.includes(k))) return { intent: "reschedule_request", confidence: 0.85 };
  if (locationKeywords.some((k) => lower.includes(k)) && !lower.includes("price")) return { intent: "location_inquiry", confidence: 0.85 };
  if (priceKeywords.some((k) => lower.includes(k)) && bookingKeywords.some((k) => lower.includes(k))) {
    return { intent: "booking_request", confidence: 0.75 };
  }
  if (bookingKeywords.some((k) => lower.includes(k))) return { intent: "booking_request", confidence: 0.82 };
  if (priceKeywords.some((k) => lower.includes(k))) return { intent: "price_inquiry", confidence: 0.88 };

  return { intent: "unknown", confidence: 0.4 };
}

export async function processInboundMessage(
  businessId: number,
  message: string,
  customerPhone: string,
  customerName?: string
): Promise<AIIntentResult> {
  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!business) throw new Error("Business not found");

  const services = await db.select().from(servicesTable).where(eq(servicesTable.isActive, true));
  const businessServices = services.filter((s) => s.businessId === businessId);

  const { intent, confidence } = classifyIntent(message);
  const matchedSvc = matchService(message, businessServices.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price,
    durationMinutes: s.durationMinutes,
  })));

  const extractedEntities: AIIntentResult["extractedEntities"] = {};
  if (matchedSvc) extractedEntities.serviceName = matchedSvc.name;
  if (customerName) extractedEntities.customerName = customerName;

  let replyDraft = "";
  let availableSlots: AIIntentResult["availableSlots"] = [];
  const actionSuggestion: AIIntentResult["actionSuggestion"] = {
    shouldReply: true,
    shouldCreatePendingBooking: false,
    shouldAskFollowUpQuestion: false,
    shouldEscalateToOwner: confidence < 0.5,
  };

  const tone = business.preferredTone ?? "friendly";
  const greet = tone === "premium" ? "" : "Hi! ";

  switch (intent) {
    case "price_inquiry": {
      if (matchedSvc) {
        replyDraft = `${greet}${matchedSvc.name} is ₹${matchedSvc.price} and takes about ${matchedSvc.durationMinutes} minutes. Would you like to book an appointment?`;
      } else {
        const serviceList = businessServices.slice(0, 5).map((s) => `• ${s.name} — ₹${s.price}`).join("\n");
        replyDraft = `${greet}Here are some of our services:\n${serviceList}\n\nWhich service are you interested in?`;
        actionSuggestion.shouldAskFollowUpQuestion = true;
      }
      break;
    }
    case "booking_request":
    case "availability_inquiry": {
      const requestedDate = extractDate(message);
      const requestedTime = extractTime(message);
      extractedEntities.requestedDate = requestedDate;
      if (requestedTime) extractedEntities.requestedTime = requestedTime;

      if (matchedSvc) {
        try {
          const slots = await getAvailableSlots(businessId, matchedSvc.id, requestedDate);
          availableSlots = slots.filter((s) => s.available).slice(0, 4);
          const dateLabel = formatDate(requestedDate);

          if (availableSlots.length === 0) {
            replyDraft = `${greet}Sorry, we don't have any available slots for ${matchedSvc.name} on ${dateLabel}. Would you like to check another date?`;
            actionSuggestion.shouldAskFollowUpQuestion = true;
          } else {
            const slotList = availableSlots.map((s) => s.startTime).join(", ");
            replyDraft = `${greet}${matchedSvc.name} is ₹${matchedSvc.price}. We have slots on ${dateLabel} at ${slotList}. Which time works for you?`;
            actionSuggestion.shouldCreatePendingBooking = intent === "booking_request";
          }
        } catch (e) {
          logger.error({ e }, "Error getting slots");
          replyDraft = `${greet}${matchedSvc.name} is ₹${matchedSvc.price}. Please share your preferred date and time, and I'll confirm availability!`;
          actionSuggestion.shouldAskFollowUpQuestion = true;
        }
      } else {
        replyDraft = `${greet}Which service are you looking to book? We offer haircut, facial, manicure, and more. What works for you?`;
        actionSuggestion.shouldAskFollowUpQuestion = true;
      }
      break;
    }
    case "cancel_request": {
      replyDraft = `${greet}I've noted your cancellation request. Our cancellation policy: ${business.cancellationPolicy ?? "Please contact us for details"}. Our team will confirm shortly.`;
      actionSuggestion.shouldEscalateToOwner = true;
      break;
    }
    case "reschedule_request": {
      replyDraft = `${greet}Sure, I can help you reschedule! Please share your preferred new date and time.`;
      actionSuggestion.shouldAskFollowUpQuestion = true;
      actionSuggestion.shouldEscalateToOwner = true;
      break;
    }
    case "location_inquiry": {
      const addr = business.address ?? "Please contact us for our address";
      const mapsLink = business.googleMapsLink ? `\n📍 ${business.googleMapsLink}` : "";
      replyDraft = `${greet}We are located at: ${addr}${mapsLink}`;
      break;
    }
    default: {
      replyDraft = `${greet}Thanks for reaching out to ${business.name}! How can we help you today? You can ask about our services, prices, or book an appointment.`;
      actionSuggestion.shouldAskFollowUpQuestion = true;
      actionSuggestion.shouldEscalateToOwner = confidence < 0.5;
    }
  }

  return {
    intent,
    confidence,
    extractedEntities,
    actionSuggestion,
    replyDraft,
    availableSlots: availableSlots.length > 0 ? availableSlots : undefined,
    matchedService: matchedSvc
      ? {
          id: matchedSvc.id,
          name: matchedSvc.name,
          price: matchedSvc.price,
          durationMinutes: matchedSvc.durationMinutes,
        }
      : undefined,
  };
}
