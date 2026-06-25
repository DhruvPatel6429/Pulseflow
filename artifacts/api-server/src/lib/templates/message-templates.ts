/**
 * Message Templates
 *
 * Default WhatsApp message templates for all automation event types.
 * Templates support {name}, {service}, {date}, {time}, {business}, {review_link}.
 *
 * Custom templates can be set per business in automation_settings.
 * The renderTemplate() helper interpolates all variables safely.
 */

export interface TemplateVars {
  name: string;
  service?: string;
  date?: string;
  time?: string;
  business?: string;
  review_link?: string;
  days?: string;
}

// ─── Default Templates ────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATES = {
  booking_confirmation:
    "Hi {name}! ✅ Your {service} at {business} is confirmed for {date} at {time}. See you then! 💅",

  reminder_24h:
    "Hi {name}! 💫 Just a reminder — your {service} is tomorrow, {date} at {time} at {business}. Can't wait to see you! 🌸",

  reminder_2h:
    "Hi {name}! ⏰ Your {service} is in 2 hours at {time}. We're excited to see you at {business}! 🌟",

  review_request:
    "Hi {name}! 🌸 Hope you loved your {service} at {business}! If you have a minute, we'd love a Google review — it helps us so much 🙏\n{review_link}",

  repeat_reminder:
    "Hi {name}! 💆 It's been a while since your last {service}. Want to book your next session at {business}? Just reply with your preferred date and time!",

  missed_followup:
    "Hi {name}, we noticed you missed your {service} today 😊 We'd love to reschedule at your convenience — just reply with a time that works!",
} as const;

export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;

// ─── Template Renderer ────────────────────────────────────────────────────────

/**
 * Renders a template string by replacing {variable} placeholders.
 * Unknown variables are left as-is (no accidental data leakage).
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = (vars as unknown as Record<string, string | undefined>)[key];
    return value ?? match; // leave unrecognised placeholders intact
  });
}

/**
 * Build a message for a given automation event type.
 * Prefers the custom template from automation settings if provided.
 */
export function buildAutomationMessage(
  type: TemplateKey,
  vars: TemplateVars,
  customTemplate?: string | null
): string | null {
  // review_request requires a review link — skip if missing
  if (type === "review_request" && !vars.review_link) return null;

  const template = customTemplate ?? DEFAULT_TEMPLATES[type];
  return renderTemplate(template, vars);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatDateLabel(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function formatTimeLabel(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}
