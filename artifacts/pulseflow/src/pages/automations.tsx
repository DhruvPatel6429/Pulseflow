import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Bell, Star, RotateCcw, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { apiFetch } from "@/lib/api";
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

export default function Automations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<Partial<AutomationSettings>>({});

  const { data, isLoading } = useQuery<AutomationSettings>({
    queryKey: ["automation"],
    queryFn: () => apiFetch("/automation"),
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
        method: "PATCH",
        body: JSON.stringify(local),
      });
      qc.invalidateQueries({ queryKey: ["automation"] });
      toast({ description: "Automation settings saved!" });
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Error saving", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-muted-foreground text-sm">Configure your AI-powered follow-ups and reminders</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AI Auto Reply */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">AI Auto-Reply</CardTitle>
              </div>
              <Switch
                checked={local.aiAutoReplyEnabled ?? true}
                onCheckedChange={(v) => set("aiAutoReplyEnabled", v)}
              />
            </div>
            <CardDescription>Automatically reply to customer messages on WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label className="text-sm">Confidence Threshold: {Math.round((local.aiConfidenceThreshold ?? 0.8) * 100)}%</Label>
              <Slider
                min={50}
                max={99}
                step={5}
                value={[Math.round((local.aiConfidenceThreshold ?? 0.8) * 100)]}
                onValueChange={([v]) => set("aiConfidenceThreshold", v / 100)}
                disabled={!local.aiAutoReplyEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Messages below this confidence will be queued for your review
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 24h Reminder */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-base">24-Hour Reminder</CardTitle>
              </div>
              <Switch
                checked={local.reminder24hEnabled ?? true}
                onCheckedChange={(v) => set("reminder24hEnabled", v)}
              />
            </div>
            <CardDescription>Send a reminder WhatsApp message 24 hours before the appointment</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label className="text-sm">Message Template</Label>
              <Textarea
                className="mt-1 text-sm"
                placeholder="Hi {name}, this is a reminder for your {service} appointment tomorrow at {time}. See you then! 😊"
                value={local.reminderTemplate ?? ""}
                onChange={(e) => set("reminderTemplate", e.target.value)}
                disabled={!local.reminder24hEnabled}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">Use {"{name}"}, {"{service}"}, {"{time}"}, {"{date}"} as placeholders</p>
            </div>
          </CardContent>
        </Card>

        {/* 2h Reminder */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <CardTitle className="text-base">2-Hour Reminder</CardTitle>
              </div>
              <Switch
                checked={local.reminder2hEnabled ?? true}
                onCheckedChange={(v) => set("reminder2hEnabled", v)}
              />
            </div>
            <CardDescription>Send a quick reminder 2 hours before the appointment</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Uses the same reminder template above</p>
          </CardContent>
        </Card>

        {/* Review Request */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <CardTitle className="text-base">Review Request</CardTitle>
              </div>
              <Switch
                checked={local.reviewRequestEnabled ?? true}
                onCheckedChange={(v) => set("reviewRequestEnabled", v)}
              />
            </div>
            <CardDescription>Ask for a Google review after the appointment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-sm shrink-0">Send after</Label>
              <Input
                type="number"
                min="1"
                max="48"
                className="w-20"
                value={local.reviewRequestDelayHours ?? 2}
                onChange={(e) => set("reviewRequestDelayHours", parseInt(e.target.value) || 2)}
                disabled={!local.reviewRequestEnabled}
              />
              <Label className="text-sm">hours</Label>
            </div>
            <div>
              <Label className="text-sm">Review Template</Label>
              <Textarea
                className="mt-1 text-sm"
                placeholder="Hi {name}, thank you for visiting {business}! We'd love your feedback. Please leave us a review: {review_link} ⭐"
                value={local.reviewTemplate ?? ""}
                onChange={(e) => set("reviewTemplate", e.target.value)}
                disabled={!local.reviewRequestEnabled}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Repeat Reminder */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-base">Repeat Visit Reminder</CardTitle>
              </div>
              <Switch
                checked={local.repeatReminderEnabled ?? true}
                onCheckedChange={(v) => set("repeatReminderEnabled", v)}
              />
            </div>
            <CardDescription>
              Remind customers to book again after X days (configurable per service). Great for haircuts, facials, and regular treatments.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
