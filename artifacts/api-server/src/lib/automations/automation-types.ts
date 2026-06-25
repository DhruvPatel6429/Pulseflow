/**
 * Automation Engine — Shared Types
 */

export type AutomationEventType =
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "review_request"
  | "repeat_reminder"
  | "missed_followup";

export type AutomationEventStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "skipped"
  | "cancelled";

export interface ProcessResult {
  ok: boolean;
  status: "sent" | "skipped" | "failed";
  message?: string;
  error?: string;
}

export interface AutomationRunSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  processedAt: string;
}
