import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarDays, Users, Bot, IndianRupee, Zap,
  CheckCircle, XCircle, RotateCcw, Sparkles, Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, formatCurrency, formatDate, formatTime, STATUS_COLORS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  todayCount: number;
  upcomingCount: number;
  pendingAiActions: number;
  totalCustomers: number;
  completedThisWeek: number;
  revenueThisWeek: number;
  noShowRate: number;
  remindersDueToday: number;
  bookingsByStatus: Array<{ status: string; count: number }>;
  topServices: Array<{ serviceId: number; name: string; count: number; revenue: number }>;
}

interface Booking {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  createdByAI: boolean;
  service: { name: string; price: number } | null;
  customer: { name: string; phone: string } | null;
}

interface AiAction {
  id: number;
  actionType: string;
  inputSummary?: string | null;
  replyDraft?: string | null;
  confidenceScore?: number | null;
  customer: { name: string; phone: string } | null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "bg-primary/10",
  iconColor = "text-primary",
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  iconColor?: string;
  onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "cursor-pointer hover:border-primary/40 transition-colors" : ""} onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const INTENT_LABELS: Record<string, string> = {
  booking_request: "Booking",
  price_inquiry: "Price Query",
  availability_inquiry: "Availability",
  cancel_request: "Cancel",
  reschedule_request: "Reschedule",
  location_inquiry: "Location",
  unknown: "Unknown",
};

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState<null | { summary: Record<string, number | string> }>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [showPendingActions, setShowPendingActions] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => apiFetch("/dashboard/stats"),
    refetchInterval: 30000,
  });

  const { data: todayBookings, isLoading: todayLoading } = useQuery<Booking[]>({
    queryKey: ["dashboard-today"],
    queryFn: () => apiFetch("/dashboard/today"),
    refetchInterval: 30000,
  });

  const { data: pendingActions = [] } = useQuery<AiAction[]>({
    queryKey: ["ai-inbox"],
    queryFn: () => apiFetch("/ai/inbox"),
    refetchInterval: 15000,
  });

  async function loadDemoData() {
    setDemoLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; skipped?: boolean; message: string; summary?: Record<string, number | string> }>(
        "/seed/demo",
        { method: "POST" }
      );
      if (result.skipped) {
        toast({ description: "Demo data already loaded!" });
      } else {
        setDemoResult({ summary: result.summary ?? {} });
        qc.invalidateQueries();
        toast({ description: "GlowNest Studio demo data loaded! 🌸" });
      }
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Failed to load demo data", variant: "destructive" });
    } finally {
      setDemoLoading(false);
    }
  }

  async function runAutomations() {
    setCronLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; processed: number; sent: number; failed: number }>(
        "/cron/process-automations",
        { method: "POST" }
      );
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast({
        description: `Processed ${result.processed} jobs — ${result.sent} sent, ${result.failed} failed`,
      });
    } catch (e: unknown) {
      toast({ description: "Failed to run automations", variant: "destructive" });
    } finally {
      setCronLoading(false);
    }
  }

  async function approveAction(id: number) {
    await apiFetch(`/ai/actions/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
    qc.invalidateQueries({ queryKey: ["ai-inbox"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast({ description: "Reply sent!" });
  }

  async function rejectAction(id: number) {
    await apiFetch(`/ai/actions/${id}/reject`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["ai-inbox"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    toast({ description: "Action dismissed" });
  }

  const noDataYet = !statsLoading && stats && stats.totalCustomers === 0 && stats.todayCount === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runAutomations}
            disabled={cronLoading}
            title="Process due reminder & review jobs"
          >
            <Zap className={`w-3.5 h-3.5 mr-1.5 ${cronLoading ? "animate-pulse" : ""}`} />
            {cronLoading ? "Running..." : "Run Automations"}
          </Button>
          <Link href="/bookings/new">
            <Button size="sm">+ New Booking</Button>
          </Link>
        </div>
      </div>

      {/* Demo banner */}
      {noDataYet && (
        <div className="bg-gradient-to-r from-primary/10 to-secondary/30 border border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="font-semibold">Load Demo Data</p>
            </div>
            <p className="text-sm text-muted-foreground">
              See PulseFlow in action with GlowNest Studio — sample bookings, WhatsApp conversations, and AI responses.
            </p>
          </div>
          <Button onClick={loadDemoData} disabled={demoLoading} className="shrink-0">
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {demoLoading ? "Loading..." : "Load Demo"}
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard
              icon={CalendarDays}
              label="Today's Bookings"
              value={stats?.todayCount ?? 0}
              sub={`${stats?.upcomingCount ?? 0} more this week`}
            />
            <StatCard
              icon={IndianRupee}
              label="Revenue This Week"
              value={formatCurrency(stats?.revenueThisWeek ?? 0)}
              sub={`${stats?.completedThisWeek ?? 0} completed`}
              color="bg-green-100"
              iconColor="text-green-700"
            />
            <StatCard
              icon={Bot}
              label="Pending AI Reviews"
              value={stats?.pendingAiActions ?? 0}
              sub={stats?.pendingAiActions ? "Tap to review" : "All clear"}
              color={stats?.pendingAiActions ? "bg-amber-100" : "bg-muted"}
              iconColor={stats?.pendingAiActions ? "text-amber-700" : "text-muted-foreground"}
              onClick={stats?.pendingAiActions ? () => setShowPendingActions(true) : undefined}
            />
            <StatCard
              icon={Users}
              label="Total Customers"
              value={stats?.totalCustomers ?? 0}
              sub={`${stats?.noShowRate ?? 0}% no-show rate`}
              color="bg-blue-100"
              iconColor="text-blue-700"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Today's Schedule — wider */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Today's Schedule</CardTitle>
            <Link href="/bookings"><span className="text-xs text-primary cursor-pointer hover:underline">View all →</span></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : !todayBookings?.length ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No bookings today
                <div className="mt-3">
                  <Link href="/bookings/new"><Button size="sm">+ Add Booking</Button></Link>
                </div>
              </div>
            ) : (
              todayBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-colors">
                  <div className="text-center min-w-[56px]">
                    <p className="text-xs font-bold text-primary">{formatTime(b.startTime)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatTime(b.endTime)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.customer?.name ?? "Walk-in"}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.service?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {b.createdByAI && (
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">AI</Badge>
                    )}
                    <Badge className={`text-[10px] ${STATUS_COLORS[b.status]}`}>{b.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Top Services */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Services This Week</CardTitle>
            </CardHeader>
            <CardContent>
              {!stats?.topServices?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              ) : (
                <div className="space-y-2.5">
                  {stats.topServices.slice(0, 5).map((s, i) => (
                    <div key={s.serviceId} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.count} bookings</p>
                      </div>
                      <span className="text-sm font-semibold text-green-700">{formatCurrency(s.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Booking Status */}
          {stats?.bookingsByStatus?.length ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Booking Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.bookingsByStatus.map((s) => (
                    <div key={s.status} className="flex items-center justify-between">
                      <Badge className={`text-[10px] ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {s.status.replace("_", " ")}
                      </Badge>
                      <span className="text-sm font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Pending AI Actions Quick-Review Dialog */}
      <Dialog open={showPendingActions} onOpenChange={setShowPendingActions}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pending AI Reviews ({pendingActions.length})</DialogTitle>
          </DialogHeader>
          {pendingActions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">All clear — no pending actions!</p>
          ) : (
            <div className="space-y-4">
              {pendingActions.map((action) => (
                <div key={action.id} className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{action.customer?.name ?? "Unknown"}</p>
                    <Badge className="text-[10px] bg-amber-100 text-amber-800">
                      {INTENT_LABELS[action.actionType] ?? action.actionType}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Math.round((action.confidenceScore ?? 0) * 100)}% confidence
                    </span>
                  </div>
                  {action.inputSummary && (
                    <p className="text-sm text-muted-foreground italic">"{action.inputSummary}"</p>
                  )}
                  {action.replyDraft && (
                    <div className="p-3 bg-primary/5 rounded-lg text-sm">
                      <p className="text-xs text-muted-foreground mb-1">AI Draft</p>
                      {action.replyDraft}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approveAction(action.id)} className="flex-1">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />Send
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => rejectAction(action.id)}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                    <Link href="/inbox">
                      <Button size="sm" variant="outline" onClick={() => setShowPendingActions(false)}>Edit</Button>
                    </Link>
                  </div>
                </div>
              ))}
              <Link href="/inbox">
                <Button variant="outline" className="w-full" onClick={() => setShowPendingActions(false)}>
                  Open Full AI Inbox →
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
