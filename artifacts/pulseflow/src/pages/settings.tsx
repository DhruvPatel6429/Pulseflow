import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Store, MapPin, Bot, Clock, ExternalLink, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, isMissingBusinessResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Business {
  id: number;
  name: string;
  ownerName: string;
  phone: string;
  whatsappNumber?: string | null;
  city?: string | null;
  address?: string | null;
  googleMapsLink?: string | null;
  category: string;
  description?: string | null;
  preferredTone?: string;
  reviewLink?: string | null;
  cancellationPolicy?: string | null;
  tokenPolicy?: string | null;
  whatsappVerifyToken?: string | null;
  workingHours?: unknown;
}

const dayLabels: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

type WorkingHours = Record<string, { open: string; close: string; isOpen: boolean }>;

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Business>>({});
  const [hours, setHours] = useState<WorkingHours>({});

  const { data, isLoading } = useQuery<Business | null>({
    queryKey: ["business"],
    queryFn: async () => {
      try {
        const res = await apiFetch<Business | null>("/business");
        console.log("business API response:", res);
        return res ?? null;
      } catch (error) {
        if (isMissingBusinessResponse(error)) {
          console.log("business API response:", null);
          return null;
        }
        throw error;
      }
    },
  });

  useEffect(() => {
    if (data) {
      setForm(data);
      if (data.workingHours && typeof data.workingHours === "object") {
        setHours(data.workingHours as WorkingHours);
      }
    }
  }, [data]);

  function set(k: keyof Business, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!data?.id) {
      toast({ description: "Finish onboarding before saving settings.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries({ ...form, workingHours: hours }).filter(([, v]) => v !== null)
      );
      await apiFetch("/business", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      qc.invalidateQueries({ queryKey: ["business"] });
      toast({ description: "Settings saved successfully!" });
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Error saving", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your business profile and preferences</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Business Info</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Business Name</Label>
              <Input className="mt-1" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Owner Name</Label>
              <Input className="mt-1" value={form.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category ?? "salon"} onValueChange={(v) => set("category", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["salon", "spa", "beauty_parlour", "barbershop", "nail_studio", "tattoo", "wellness", "other"].map((c) => (
                  <SelectItem key={c} value={c}>{c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea className="mt-1" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Contact & Location */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Contact & Location</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Phone Number</Label>
              <Input className="mt-1" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>WhatsApp Number</Label>
              <Input className="mt-1" value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>City</Label>
              <Input className="mt-1" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea className="mt-1" value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Google Maps Link</Label>
            <Input className="mt-1" value={form.googleMapsLink ?? ""} onChange={(e) => set("googleMapsLink", e.target.value)} placeholder="https://maps.google.com/..." />
          </div>
        </CardContent>
      </Card>

      {/* Working Hours */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Working Hours</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(dayLabels).map(([day, label]) => {
            const h = hours[day] ?? { open: "10:00", close: "20:00", isOpen: false };
            return (
              <div key={day} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={h.isOpen}
                  onChange={(e) => setHours((prev) => ({ ...prev, [day]: { ...h, isOpen: e.target.checked } }))}
                  className="accent-primary"
                />
                <span className="w-10 text-sm font-medium">{label}</span>
                {h.isOpen ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input type="time" value={h.open} onChange={(e) => setHours((prev) => ({ ...prev, [day]: { ...h, open: e.target.value } }))} className="flex-1 text-sm" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" value={h.close} onChange={(e) => setHours((prev) => ({ ...prev, [day]: { ...h, close: e.target.value } }))} className="flex-1 text-sm" />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* AI Settings */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">AI & WhatsApp</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>AI Reply Tone</Label>
            <Select value={form.preferredTone ?? "friendly"} onValueChange={(v) => set("preferredTone", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly & Warm 😊</SelectItem>
                <SelectItem value="professional">Professional & Formal 🤝</SelectItem>
                <SelectItem value="premium">Premium & Exclusive ✨</SelectItem>
                <SelectItem value="casual">Casual & Fun 🎉</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Google Review Link</Label>
            <div className="flex gap-2 mt-1">
              <Input value={form.reviewLink ?? ""} onChange={(e) => set("reviewLink", e.target.value)} placeholder="https://g.page/r/..." />
              {form.reviewLink && (
                <a href={form.reviewLink} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="icon"><ExternalLink className="w-4 h-4" /></Button>
                </a>
              )}
            </div>
          </div>
          <div>
            <Label>Cancellation Policy</Label>
            <Textarea className="mt-1" value={form.cancellationPolicy ?? ""} onChange={(e) => set("cancellationPolicy", e.target.value)} rows={2} />
          </div>
          <div>
            <Label>WhatsApp Webhook Verify Token</Label>
            <Input className="mt-1" type="password" value={form.whatsappVerifyToken ?? ""} onChange={(e) => set("whatsappVerifyToken", e.target.value)} placeholder="Set a secret token for Meta webhook verification" />
            <p className="text-xs text-muted-foreground mt-1">Used to verify the WhatsApp webhook URL in Meta Business Manager</p>
          </div>
        </CardContent>
      </Card>

      {/* Team Management — link card for owners */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Team</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Invite staff members to access bookings, AI inbox, and customers.
          </p>
          <Link href="/settings/team">
            <Button variant="outline" size="sm">Manage team →</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
