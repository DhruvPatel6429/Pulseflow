import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Zap, Crown, Clock, AlertTriangle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Subscription {
  id: number;
  plan: "trial" | "starter" | "pro";
  status: "trialing" | "active" | "past_due" | "cancelled";
  staff_limit: number;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
}

interface Plans {
  trial:   { name: string; staffLimit: number; priceMonthly: number };
  starter: { name: string; staffLimit: number; priceMonthly: number };
  pro:     { name: string; staffLimit: number; priceMonthly: number };
}

interface BillingData {
  subscription: Subscription | null;
  plans: Plans;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

function daysLeft(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function StatusBadge({ status }: { status: Subscription["status"] }) {
  const map: Record<typeof status, { label: string; className: string }> = {
    trialing:     { label: "Trial",    className: "bg-blue-100 text-blue-800" },
    active:       { label: "Active",   className: "bg-green-100 text-green-800" },
    past_due:     { label: "Past Due", className: "bg-yellow-100 text-yellow-800" },
    cancelled:    { label: "Cancelled",className: "bg-red-100 text-red-800" },
  };
  const { label, className } = map[status];
  return <Badge className={className}>{label}</Badge>;
}

const PLAN_FEATURES: Record<"starter" | "pro", string[]> = {
  starter: [
    "1 staff login",
    "Unlimited bookings",
    "AI WhatsApp auto-reply",
    "Appointment reminders",
    "Customer management",
  ],
  pro: [
    "Up to 5 staff logins",
    "Everything in Starter",
    "Team access controls",
    "Priority support",
    "Advanced analytics",
  ],
};

export default function BillingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ["billing"],
    queryFn: () => apiFetch<BillingData>("/billing/subscription"),
    staleTime: 30_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: "starter" | "pro") => {
      const result = await apiFetch<{ subscriptionId: string; keyId: string }>(
        "/billing/checkout",
        { method: "POST", body: JSON.stringify({ plan }) },
      );
      return result;
    },
    onSuccess: async ({ subscriptionId, keyId }) => {
      try {
        await loadRazorpay();
      } catch {
        toast({ title: "Error", description: "Could not load payment window. Please try again.", variant: "destructive" });
        return;
      }
      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "PulseFlow",
        description: "AI Front Desk for your salon",
        theme: { color: "#be4b6a" },
        handler: () => {
          toast({ title: "Payment successful!", description: "Your subscription is now active." });
          qc.invalidateQueries({ queryKey: ["billing"] });
        },
        modal: {
          ondismiss: () => {
            toast({ title: "Payment cancelled", description: "You can upgrade anytime from the Billing page." });
          },
        },
      });
      rzp.open();
    },
    onError: (err: Error) => {
      toast({ title: "Billing error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch("/billing/cancel", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Subscription cancelled", description: "You'll retain access until the end of your billing period." });
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-2" />
        <div className="h-4 w-72 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  const sub = data?.subscription;
  const isTrialing = sub?.status === "trialing";
  const isActive   = sub?.status === "active";
  const trialDays  = isTrialing ? daysLeft(sub?.current_period_end ?? null) : 0;
  const trialExpired = isTrialing && trialDays === 0;

  return (
    <div className="p-8 max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">Manage your PulseFlow subscription.</p>
      </div>

      {/* Trial / status banner */}
      {isTrialing && !trialExpired && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex items-center gap-3 py-4">
            <Clock className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <p className="font-medium text-blue-900">
                {trialDays === 1 ? "1 day left" : `${trialDays} days left`} in your free trial
              </p>
              <p className="text-sm text-blue-700">Subscribe before your trial ends to keep full access.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {trialExpired && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="font-medium text-red-900">Your trial has ended</p>
              <p className="text-sm text-red-700">Subscribe below to restore access to bookings, AI inbox, and automations.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {sub?.status === "past_due" && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-yellow-700 shrink-0" />
            <p className="text-sm text-yellow-800 font-medium">Payment is past due. Please update your billing details to restore access.</p>
          </CardContent>
        </Card>
      )}

      {/* Current plan */}
      {sub && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current Plan</CardTitle>
              <StatusBadge status={sub.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-semibold capitalize">{sub.plan === "trial" ? "Free Trial" : sub.plan}</p>
            {sub.current_period_end && (
              <p className="text-sm text-muted-foreground">
                {sub.status === "trialing"
                  ? `Trial ends: ${new Date(sub.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                  : `Next billing: ${new Date(sub.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
              </p>
            )}
            <p className="text-sm text-muted-foreground">Staff logins: {sub.staff_limit}</p>
            {isActive && sub.razorpay_subscription_id && (
              <>
                <Separator className="my-3" />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {cancelMutation.isPending ? "Cancelling…" : "Cancel Subscription"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      {!isActive && (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-1">Choose a plan</h2>
            <p className="text-sm text-muted-foreground">All plans include a 14-day free trial for new salons.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["starter", "pro"] as const).map((planKey) => {
              const planInfo = data?.plans[planKey];
              const features = PLAN_FEATURES[planKey];
              const isPro = planKey === "pro";
              return (
                <Card
                  key={planKey}
                  className={isPro ? "border-primary shadow-md" : ""}
                >
                  {isPro && (
                    <div className="bg-primary text-primary-foreground text-xs font-semibold text-center py-1 rounded-t-lg tracking-wide">
                      MOST POPULAR
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {isPro ? <Crown className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-primary" />}
                      <CardTitle>{planInfo?.name ?? planKey}</CardTitle>
                    </div>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">
                        {formatCurrency(planInfo?.priceMonthly ?? 0)}
                      </span>
                      <span className="text-muted-foreground">/month</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isPro ? "default" : "outline"}
                      onClick={() => checkoutMutation.mutate(planKey)}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? "Opening checkout…" : `Subscribe to ${planInfo?.name}`}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
