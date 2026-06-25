/**
 * AI Layer — Reply Drafter (Responder)
 *
 * Builds reply drafts from classified intent + business/service context.
 * Uses prompt helpers from prompts.ts — all copy is centralised there.
 */

import type { AIIntentResult, BusinessContext, ServiceContext, AIActionSuggestion } from "./types";
import {
  buildPriceReply, buildServiceListReply, buildAvailabilityReply,
  buildNoSlotsReply, buildBookingServiceUnknownReply, buildCancelReply,
  buildRescheduleReply, buildLocationReply, buildFallbackReply,
} from "./prompts";
import type { ClassificationResult } from "./classifier";
import { matchService, extractDate, extractTime, formatDateLabel } from "./classifier";
import { getAvailableSlots } from "../booking-engine";
import { logger } from "../logger";

interface BuildReplyParams {
  classification: ClassificationResult;
  message: string;
  business: BusinessContext;
  services: ServiceContext[];
  threshold: number;
}

export async function buildReply(params: BuildReplyParams): Promise<AIIntentResult> {
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

  // High-consultation or premium services always escalate
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
          logger.error({ e }, "Failed to fetch slots for AI reply");
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
