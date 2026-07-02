const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const apiBase = `${base}/api`;

export class ApiFetchError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`API error ${status}${body ? `: ${body}` : ""}`);
    this.name = "ApiFetchError";
    this.status = status;
    this.body = body;
  }
}

export function isMissingBusinessResponse(error: unknown): boolean {
  return error instanceof ApiFetchError && (error.status === 401 || error.status === 404);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiFetchError(res.status, text);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null as T;
  }
  const text = await res.text();
  if (!text.trim()) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

export function formatCurrency(amount: number | string): string {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  rescheduled: "bg-purple-100 text-purple-800",
  no_show: "bg-gray-100 text-gray-700",
};
