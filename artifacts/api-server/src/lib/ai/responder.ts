/**
 * AI Layer — OpenAI Responder & Intent Classifier
 *
 * Employs a production OpenAI completion flow with structured JSON outputs.
 * Falls back gracefully to rule-based templates if OPENAI_API_KEY is not configured.
 */

import OpenAI from "openai";
import type { AIIntentResult, BusinessContext, ServiceContext, AIActionSuggestion, AIIntent } from "./types";
import {
  buildPriceReply, buildServiceListReply, buildAvailabilityReply,
  buildNoSlotsReply, buildBookingServiceUnknownReply, buildCancelReply,
  buildRescheduleReply, buildLocationReply, buildFallbackReply,
} from "./prompts";
import { classifyIntent, matchService, extractDate, extractTime, formatDateLabel } from "./classifier";
import { getAvailableSlots } from "../booking-engine";
import { logger } from "../logger";

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

interface BuildReplyParams {
  classification: { intent: AIIntent; confidence: number };
  message: string;
  business: BusinessContext;
  services: ServiceContext[];
  threshold: number;
  history?: Array<{ direction: string; content: string }>;
  customer?: { name: string; phone: string; notes?: string | null; totalVisits: number; lastVisitAt?: Date | null };
}

export async function buildReply(params: BuildReplyParams): Promise<AIIntentResult> {
  const { classification, message, business, services, threshold, history = [], customer } = params;

  if (!openai) {
    logger.info("OPENAI_API_KEY not configured, falling back to rule-based classification");
    return buildRuleBasedReply(params);
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const servicesListText = services
      .map((s) => `- ${s.name}: ₹${s.price}, ${s.durationMinutes} mins. (Requires Consultation: ${s.requiresConsultation ? "Yes" : "No"}, Requires Token Advance: ${s.requiresTokenAdvance ? "Yes" : "No"})`)
      .join("\n");

    const historyText = history
      .map((msg) => `${msg.direction.toUpperCase()}: ${msg.content}`)
      .join("\n");

    const customerText = customer
      ? `- Name: ${customer.name}\n- Notes: ${customer.notes || "None"}\n- Total Visits: ${customer.totalVisits}\n- Last Visit: ${customer.lastVisitAt ? customer.lastVisitAt.toISOString().slice(0, 10) : "Never"}`
      : "Unknown Customer";

    // Stage 1: Classify intent and extract entities
    const stage1Prompt = `You are an AI assistant analyzing a WhatsApp customer message for a beauty/wellness salon.
Classify the user's intent into one of the following:
- booking_request: User wants to book/schedule an appointment.
- reschedule_request: User wants to change the date/time of an existing booking.
- cancel_request: User wants to cancel an appointment.
- price_inquiry: User asks about the price, cost, or rates of services.
- availability_inquiry: User asks if a slot, day, or time is open or available.
- location_inquiry: User asks for the address or location.
- faq: User asks about opening hours, policies, or general business information.
- unknown: Any message that doesn't fit the above.

Active Services:
${servicesListText}

Current Context:
- Today's date: ${todayStr}
- Day of week: ${dayOfWeek}

Message: "${message}"

Respond strictly with a JSON object matching this schema:
{
  "intent": "one of the intent types above",
  "matchedServiceName": "exact name of matching service from Active Services, or null",
  "requestedDate": "YYYY-MM-DD if mentioned or implied (e.g. tomorrow), or null",
  "requestedTime": "HH:MM (24h format) if mentioned, or null",
  "customerName": "customer name if mentioned, or null"
}
`;

    const stage1Response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: stage1Prompt }],
      response_format: { type: "json_object" },
    });

    const parsedStage1 = JSON.parse(stage1Response.choices[0]?.message?.content || "{}") as {
      intent: AIIntent;
      matchedServiceName: string | null;
      requestedDate: string | null;
      requestedTime: string | null;
      customerName: string | null;
    };

    const detectedIntent = parsedStage1.intent || "unknown";
    const matchedSvc = services.find((s) => s.name === parsedStage1.matchedServiceName);
    const requestedDate = parsedStage1.requestedDate || todayStr;
    const requestedTime = parsedStage1.requestedTime || undefined;

    // Fetch slots if booking or availability check
    let availableSlots: AIIntentResult["availableSlots"] = [];
    if ((detectedIntent === "booking_request" || detectedIntent === "availability_inquiry") && matchedSvc) {
      try {
        const slots = await getAvailableSlots(business.id, matchedSvc.id, requestedDate);
        availableSlots = slots.filter((s) => s.available).slice(0, 4);
      } catch (err) {
        logger.error({ err }, "Error fetching slots during OpenAI reply compilation");
      }
    }

    const slotsText = availableSlots.length > 0
      ? availableSlots.map((s) => s.startTime).join(", ")
      : "No slots available";

    // Stage 2: Draft the response based on full context
    const stage2Prompt = `You are the AI front desk assistant for "${business.name}".
Preferred Tone: ${business.preferredTone}
Category: ${business.category}
Description: ${business.description || "Salon & Spa"}
Cancellation Policy: ${business.cancellationPolicy || "Please notify us in advance."}
Token Policy: ${business.tokenPolicy || "No advance required."}
Google Maps Link: ${business.googleMapsLink || ""}
Working Hours: ${JSON.stringify(business.workingHours)}

Active Services:
${servicesListText}

Customer Context:
${customerText}

Recent Message Thread (most recent last):
${historyText}

Latest Message: "${message}"
Detected Intent: ${detectedIntent}
Matched Service: ${matchedSvc ? matchedSvc.name : "None"}
Requested Date: ${requestedDate}
Available Slots: ${slotsText}

Instructions:
1. Draft a reply responding to the latest customer message.
2. Maintain the preferred tone. Keep it friendly, professional, and clear.
3. NEVER hallucinate prices. If they ask about a price, use the exact price in the Active Services list.
4. NEVER invent policies. Use only defined cancellation or token policies.
5. If booking/availability was requested and slots exist, offer the slots (${slotsText}) and ask which works.
6. Decide on Action Suggestions:
   - shouldCreatePendingBooking: true if they asked for a specific slot and we have slots.
   - shouldAskFollowUpQuestion: true if we need to clarify dates, services, or times.
   - shouldEscalateToOwner: true if confidence is below ${threshold}, or if they requested a cancel/reschedule, or if the service requires consultation.
7. Determine confidence score (0.0 to 1.0). Cap at 0.60 to force human review if:
   - The service requires consultation or advance token.
   - The intent is reschedule_request or cancel_request.
   - The request is unclear.

Respond strictly with a JSON object matching this schema:
{
  "confidence": 0.95,
  "actionSuggestion": {
    "shouldReply": true,
    "shouldCreatePendingBooking": false,
    "shouldAskFollowUpQuestion": false,
    "shouldEscalateToOwner": false
  },
  "replyDraft": "Your drafted text response"
}
`;

    const stage2Response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: stage2Prompt }],
      response_format: { type: "json_object" },
    });

    const parsedStage2 = JSON.parse(stage2Response.choices[0]?.message?.content || "{}") as {
      confidence: number;
      actionSuggestion: AIActionSuggestion;
      replyDraft: string;
    };

    return {
      intent: detectedIntent,
      confidence: parsedStage2.confidence ?? 0.8,
      extractedEntities: {
        serviceName: matchedSvc?.name,
        requestedDate: parsedStage1.requestedDate || undefined,
        requestedTime: parsedStage1.requestedTime || undefined,
        customerName: parsedStage1.customerName || undefined,
      },
      actionSuggestion: parsedStage2.actionSuggestion,
      replyDraft: parsedStage2.replyDraft,
      availableSlots: availableSlots.length > 0 ? availableSlots : undefined,
      matchedService: matchedSvc
        ? {
            id: matchedSvc.id,
            name: matchedSvc.name,
            price: matchedSvc.price,
            durationMinutes: matchedSvc.durationMinutes,
            requiresConsultation: matchedSvc.requiresConsultation,
            requiresTokenAdvance: matchedSvc.requiresTokenAdvance,
          }
        : undefined,
    };
  } catch (err) {
    logger.error({ err }, "Error running OpenAI completions, falling back to rule-based");
    return buildRuleBasedReply(params);
  }
}

async function buildRuleBasedReply(params: BuildReplyParams): Promise<AIIntentResult> {
  const { classification, message, business, services, threshold } = params;
  const { intent, confidence } = classification;

  const matchedSvc = matchService(message, services);

  const entities: AIIntentResult["extractedEntities"] = {};
  if (matchedSvc) entities.serviceName = matchedSvc.name;

  const action: AIActionSuggestion = {
    shouldReply: true,
    shouldCreatePendingBooking: false,
    shouldAskFollowUpQuestion: false,
    shouldEscalateToOwner: confidence < threshold,
  };

  if (matchedSvc?.requiresConsultation || matchedSvc?.requiresTokenAdvance) {
    action.shouldEscalateToOwner = true;
  }

  let replyDraft = "";
  let availableSlots: AIIntentResult["availableSlots"] = [];

  switch (intent) {
    case "price_inquiry": {
      if (matchedSvc) {
        replyDraft = buildPriceReply(business, matchedSvc);
      } else {
        replyDraft = buildServiceListReply(business, services);
        action.shouldAskFollowUpQuestion = true;
      }
      break;
    }

    case "booking_request":
    case "availability_inquiry": {
      const requestedDate = extractDate(message);
      const requestedTime = extractTime(message);
      entities.requestedDate = requestedDate;
      if (requestedTime) entities.requestedTime = requestedTime;

      if (matchedSvc) {
        try {
          const slots = await getAvailableSlots(business.id, matchedSvc.id, requestedDate);
          availableSlots = slots.filter((s) => s.available).slice(0, 4);
          const dateLabel = formatDateLabel(requestedDate);

          if (availableSlots.length === 0) {
            replyDraft = buildNoSlotsReply(business, matchedSvc, dateLabel);
            action.shouldAskFollowUpQuestion = true;
          } else {
            const slotTimes = availableSlots.map((s) => s.startTime);
            replyDraft = buildAvailabilityReply(business, matchedSvc, dateLabel, slotTimes);
            if (intent === "booking_request") action.shouldCreatePendingBooking = true;
          }
        } catch (e) {
          logger.error({ e }, "Failed to fetch slots for rule-based reply");
          replyDraft = `Hi! ${matchedSvc.name} is ₹${matchedSvc.price}. Please share your preferred date and time, and we'll confirm! 🌸`;
          action.shouldAskFollowUpQuestion = true;
        }
      } else {
        replyDraft = buildBookingServiceUnknownReply(business);
        action.shouldAskFollowUpQuestion = true;
      }
      break;
    }

    case "cancel_request": {
      replyDraft = buildCancelReply(business);
      action.shouldEscalateToOwner = true;
      break;
    }

    case "reschedule_request": {
      replyDraft = buildRescheduleReply(business);
      action.shouldAskFollowUpQuestion = true;
      action.shouldEscalateToOwner = true;
      break;
    }

    case "location_inquiry": {
      replyDraft = buildLocationReply(business);
      break;
    }

    default: {
      replyDraft = buildFallbackReply(business);
      action.shouldAskFollowUpQuestion = true;
    }
  }

  return {
    intent,
    confidence,
    extractedEntities: entities,
    actionSuggestion: action,
    replyDraft,
    availableSlots: availableSlots.length > 0 ? availableSlots : undefined,
    matchedService: matchedSvc
      ? {
          id: matchedSvc.id,
          name: matchedSvc.name,
          price: matchedSvc.price,
          durationMinutes: matchedSvc.durationMinutes,
          requiresConsultation: matchedSvc.requiresConsultation,
          requiresTokenAdvance: matchedSvc.requiresTokenAdvance,
        }
      : undefined,
  };
}
