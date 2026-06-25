/**
 * AI Layer — Intent Classifier
 *
 * Rule-based keyword classifier. No external API required.
 * Upgrade path: replace classifyIntent() with an LLM call that returns
 * the same AIIntent + confidence structure.
 */

import type { AIIntent, ServiceContext } from "./types";

const INTENT_PATTERNS: Array<{ intent: AIIntent; keywords: string[]; baseConfidence: number }> = [
  { intent: "cancel_request",      keywords: ["cancel", "cancell", "not coming", "can't come", "won't come", "nahi aana", "nahi aaunga"],  baseConfidence: 0.92 },
  { intent: "reschedule_request",  keywords: ["reschedule", "change", "move", "shift", "postpone", "different time", "different day", "change my slot"], baseConfidence: 0.88 },
  { intent: "location_inquiry",    keywords: ["where", "location", "address", "direction", "map", "place", "kahan", "address"],            baseConfidence: 0.88 },
  { intent: "booking_request",     keywords: ["book", "appointment", "slot", "schedule", "can i get", "want to", "reserve", "fix", "confirm"],            baseConfidence: 0.82 },
  { intent: "price_inquiry",       keywords: ["price", "cost", "charge", "rate", "how much", "fee", "₹", "rs ", "rupee", "kitna"],        baseConfidence: 0.88 },
  { intent: "availability_inquiry",keywords: ["available", "free slot", "open", "when can i", "do you have", "any slot"],                 baseConfidence: 0.80 },
  { intent: "faq",                 keywords: ["open", "hours", "working hours", "timing", "policy", "do you offer"],                      baseConfidence: 0.75 },
];

export interface ClassificationResult {
  intent: AIIntent;
  confidence: number;
}

export function classifyIntent(message: string): ClassificationResult {
  const lower = message.toLowerCase();

  // Priority order: more specific intents first
  for (const { intent, keywords, baseConfidence } of INTENT_PATTERNS) {
    const matchCount = keywords.filter((k) => lower.includes(k)).length;
    if (matchCount > 0) {
      // Boost confidence for multi-keyword matches
      const confidence = Math.min(0.97, baseConfidence + (matchCount - 1) * 0.04);
      return { intent, confidence };
    }
  }

  // Mixed intent: price + booking → booking_request with medium confidence
  const hasPrice = ["price", "how much", "₹", "cost"].some((k) => lower.includes(k));
  const hasBooking = ["book", "slot", "tomorrow", "can i come"].some((k) => lower.includes(k));
  if (hasPrice && hasBooking) {
    return { intent: "booking_request", confidence: 0.75 };
  }

  return { intent: "unknown", confidence: 0.35 };
}

/** Find the best matching service from a message.
 *  Uses first-word match — most Indian service names have distinctive first words. */
export function matchService(
  message: string,
  services: ServiceContext[]
): ServiceContext | undefined {
  const lower = message.toLowerCase();

  // Exact name match first
  const exact = services.find((s) => lower.includes(s.name.toLowerCase()));
  if (exact) return exact;

  // First-word match (e.g. "haircut" matches "Haircut & Blow Dry")
  return services.find((s) => {
    const firstWord = s.name.toLowerCase().split(/\s+/)[0];
    return firstWord.length >= 3 && lower.includes(firstWord);
  });
}

/** Extract a date reference from the message. Returns YYYY-MM-DD. */
export function extractDate(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("tomorrow")) return offsetDate(1);
  if (lower.includes("today")) return offsetDate(0);
  if (lower.includes("day after")) return offsetDate(2);

  const weekdays: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  for (const [day, idx] of Object.entries(weekdays)) {
    if (lower.includes(day)) {
      const now = new Date();
      const diff = (idx - now.getDay() + 7) % 7 || 7;
      return offsetDate(diff);
    }
  }

  // "24 jun" / "june 24"
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  for (const [abbr, idx] of Object.entries(months)) {
    const re = new RegExp(`(\\d{1,2})\\s*${abbr}|${abbr}\\s*(\\d{1,2})`, "i");
    const m = message.match(re);
    if (m) {
      const day = parseInt(m[1] ?? m[2], 10);
      const year = new Date().getFullYear();
      return new Date(year, idx, day).toISOString().slice(0, 10);
    }
  }

  return offsetDate(1); // default: tomorrow
}

/** Extract a time reference from the message. Returns HH:MM or undefined. */
export function extractTime(message: string): string | undefined {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
  const m = message.match(re);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (m[3].toLowerCase() === "pm" && h !== 12) h += 12;
  if (m[3].toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
