/**
 * AI Layer — Shared Types
 *
 * Strong TypeScript types for the AI intent classification and reply system.
 * All AI functions use these types for structured, predictable output.
 */

export type AIIntent =
  | "price_inquiry"
  | "availability_inquiry"
  | "booking_request"
  | "reschedule_request"
  | "cancel_request"
  | "location_inquiry"
  | "faq"
  | "unknown";

export interface AIExtractedEntities {
  serviceName?: string;
  requestedDate?: string;
  requestedTime?: string;
  customerName?: string;
}

export interface AIActionSuggestion {
  shouldReply: boolean;
  shouldCreatePendingBooking: boolean;
  shouldAskFollowUpQuestion: boolean;
  shouldEscalateToOwner: boolean;
}

export interface AIIntentResult {
  intent: AIIntent;
  confidence: number;
  extractedEntities: AIExtractedEntities;
  actionSuggestion: AIActionSuggestion;
  replyDraft: string;
  availableSlots?: Array<{ startTime: string; endTime: string; available: boolean }>;
  matchedService?: {
    id: number;
    name: string;
    price: number | string;
    durationMinutes: number;
    requiresConsultation?: boolean | null;
    requiresTokenAdvance?: boolean | null;
  };
}

export interface BusinessContext {
  id: number;
  name: string;
  address?: string | null;
  googleMapsLink?: string | null;
  category: string;
  description?: string | null;
  timezone: string;
  workingHours?: unknown;
  cancellationPolicy?: string | null;
  tokenPolicy?: string | null;
  preferredTone: string;
  reviewLink?: string | null;
}

export interface ServiceContext {
  id: number;
  name: string;
  price: string | number;
  durationMinutes: number;
  description?: string | null;
  requiresConsultation?: boolean | null;
  requiresTokenAdvance?: boolean | null;
  repeatReminderDays?: number | null;
}
