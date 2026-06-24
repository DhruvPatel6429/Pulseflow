import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Bell, Star, RotateCcw, Bot, Play, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiFetch, formatDate, formatTime } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface AutomationSettings {
  id: number;
  businessId: number;
  reminder24hEnabled: boolean;
  reminder2hEnabled: boolean;
  reviewRequestEnabled: boolean;
  reviewRequestDelayHours: number;
  repeatReminderEnabled: boolean;
  aiAutoReplyEnabled: boolean;
  aiConfidenceThreshold: number;
  reviewTemplate?: string | null;
  reminderTemplate?: string | null;
}

interface ReminderJob {
  id: number;
  type: string;
  status: string;
  scheduledFor: string;
  sentAt?: string | null;
  booking?: { bookingDate: string; startTime: string } | null;
  customer?: { name: string; phone: string } | null;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  confirmation: "Confirmation",
  reminder_24h: "24h Reminder",
  reminder_2h: "2h Reminder",
  review_request: "Review Request",
  repeat_reminder: "Repeat Nudge",
  missed_followup: "Missed Followup",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
  skipped: "bg-gray-100 text-gray-600",
};

function SettingRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex gap-3">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function Automations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [cronLoading, setCronLoading] = useState(false);
  const [cronResult, setCronResult] = useState<null | { processed: number; sent: number; failed: number }>(null);
  const [local, setLocal] = useState<Partial<AutomationSettings>>({});

  const { data, isLoading } = useQuery<AutomationSettings>({
    queryKey: ["automation"],
    queryFn: () => apiFetch("/automation"),
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<ReminderJob[]>({
    queryKey: ["jobs"],
    queryFn: () => apiFetch("/jobs?limit=20"),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);

  function set(k: keyof AutomationSettings, v: unknown) {
    setLocal((l) => ({ ...l, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/automation", {
        method: "PUT",
        body: JSON.stringify(local),
      });
      qc.invalidateQueries({ queryKey: ["automation"] });
      toast({ description: "Automation settings saved!" });
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function runCron() {
    setCronLoading(true);
    setCronResult(null);
    try {
      const result = await apiFetch<{ ok: boolean; processed: number; sent: number; failed: number }>(
        "/cron/process-automations",
        { method: "POST" }
      );
      setCronResult(result);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast({
        description: `Processed ${result.processed} job${result.processed !== 1 ? "s" : ""} — ${result.sent} sent`,
      });
    } catch (e: unknown) {
      toast({ description: "Failed to run automations", variant: "destructive" });
    } finally {
      setCronLoading(false);
    }
  }

  const pendingJobs = jobs.filter((j) => j.status === "pending");
  const recentJobs = jobs.filter((j) => j.status !== "pending").slice(0, 8);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Reminders, review requests, and AI reply settings</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Reminders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                Booking Reminders
              </CardTitle>
              <CardDescription>Automatically remind customers before their appointment</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <SettingRow
                icon={Bell}
                label="24-hour reminder"
                description="Send a WhatsApp reminder the day before the appointment"
                checked={local.reminder24hEnabled ?? true}
                onChange={(v) => set("reminder24hEnabled", v)}
              />
              <SettingRow
                icon={Bell}
                label="2-hour reminder"
                description="Send a final nudge 2 hours before the appointment"
                checked={local.reminder2hEnabled ?? true}
                onChange={(v) => set("reminder2hEnabled", v)}
              />
              <div className="pt-4">
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Custom reminder message template (leave blank for default)
                </Label>
                <Textarea
                  placeholder="Hi {name}! Your {service} is on {date} at {time} at {business}. See you soon! 🌸"
                  value={local.reminderTemplate ?? ""}
                  onChange={(e) => set("reminderTemplate", e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Variables: {"{name}"}, {"{service}"}, {"{date}"}, {"{time}"}, {"{business}"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Review requests */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                Review Requests
              </CardTitle>
              <CardDescription>Ask happy customers to leave a Google review after their visit</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              <SettingRow
                icon={Star}
                label="Review request"
                description="Send a review link a few hours after service completion"
                checked={local.reviewRequestEnabled ?? true}
                onChange={(v) => set("reviewRequestEnabled", v)}
              />
              <div className="pt-4 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Custom review message template
                  </Label>
                  <Textarea
                    placeholder="Hi {name}! Hope you loved your {service}! Please leave us a review 🙏 {review_link}"
                    value={local.reviewTemplate ?? ""}
                    onChange={(e) => set("reviewTemplate", e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Variables: {"{name}"}, {"{service}"}, {"{business}"}, {"{review_link}"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Repeat reminders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-primary" />
                Repeat Visit Reminders
              </CardTitle>
              <CardDescription>Remind customers to rebook based on each service's suggested interval</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                icon={RotateCcw}
                label="Repeat visit nudge"
                description="E.g. 'It's been 30 days since your facial — want to book your next session?' The interval is set per service."
                checked={local.repeatReminderEnabled ?? true}
                onChange={(v) => set("repeatReminderEnabled", v)}
              />
            </CardContent>
          </Card>

          {/* AI auto-reply */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                AI Auto-Reply
              </CardTitle>
              <CardDescription>Control when AI replies automatically vs. queues for your review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow
                icon={Bot}
                label="AI auto-reply enabled"
                description="When disabled, all AI drafts require your manual approval"
                checked={local.aiAutoReplyEnabled ?? true}
                onChange={(v) => set("aiAutoReplyEnabled", v)}
              />
              <Separator />
              <div>
                <div className="flex justify-between items-center mb-3">
                  <Label className="text-sm font-medium">Confidence threshold</Label>
                  <Badge variant="outline" className="font-mono">
                    {Math.round((local.aiConfidenceThreshold ?? 0.8) * 100)}%
                  </Badge>
                </div>
                <Slider
                  value={[(local.aiConfidenceThreshold ?? 0.8) * 100]}
                  onValueChange={([v]) => set("aiConfidenceThreshold", v / 100)}
                  min={50}
                  max={100}
                  step={1}
                  disabled={!local.aiAutoReplyEnabled}
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>More AI-controlled (50%)</span>
                  <span>More owner-reviewed (100%)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded-lg">
                  Replies above this confidence are sent automatically. Below it — or for bridal/premium queries — they're queued for your approval in the AI Inbox.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Job runner panel */}
        <div className="space-y-4">
          {/* Manual runner */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Job Runner
              </CardTitle>
              <CardDescription>
                Process all due automation jobs now. In production, this runs automatically every few minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={runCron} disabled={cronLoading} className="w-full">
                <Play className="w-3.5 h-3.5 mr-2" />
                {cronLoading ? "Processing..." : `Process Due Jobs (${pendingJobs.length} pending)`}
              </Button>
              {cronResult && (
                <div className="text-sm rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                  <p className="font-medium text-green-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Run complete
                  </p>
                  <p className="text-green-700 text-xs">
                    {cronResult.processed} processed · {cronResult.sent} sent · {cronResult.failed} failed
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending jobs */}
          {pendingJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Pending Jobs ({pendingJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingJobs.slice(0, 6).map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{j.customer?.name ?? "—"}</p>
                      <p className="text-muted-foreground">{JOB_TYPE_LABELS[j.type] ?? j.type}</p>
                    </div>
                    <Badge className="text-[10px] bg-amber-100 text-amber-800 shrink-0">pending</Badge>
                  </div>
                ))}
                {pendingJobs.length > 6 && (
                  <p className="text-xs text-muted-foreground">+{pendingJobs.length - 6} more</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent jobs */}
          {recentJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentJobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{j.customer?.name ?? "—"}</p>
                      <p className="text-muted-foreground">{JOB_TYPE_LABELS[j.type] ?? j.type}</p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${JOB_STATUS_COLORS[j.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {j.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!jobsLoading && jobs.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                <Clock className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No automation jobs yet. Confirm a booking to start scheduling reminders.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
