import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Store, Phone, MapPin, Clock, Bot, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiFetchError, apiFetch, isMissingBusinessResponse } from "@/lib/api";

const CATEGORIES = ["salon", "spa", "beauty_parlour", "barbershop", "nail_studio", "tattoo", "wellness", "other"];
const STEPS = ["Business", "Contact", "Hours", "AI Settings", "Done"];

const DEFAULT_HOURS = {
  mon: { open: "10:00", close: "20:00", isOpen: true },
  tue: { open: "10:00", close: "20:00", isOpen: true },
  wed: { open: "10:00", close: "20:00", isOpen: true },
  thu: { open: "10:00", close: "20:00", isOpen: true },
  fri: { open: "10:00", close: "20:00", isOpen: true },
  sat: { open: "10:00", close: "20:00", isOpen: true },
  sun: { open: "10:00", close: "20:00", isOpen: false },
};

interface Business {
  id: number;
  preferredTone?: string | null;
  reviewLink?: string | null;
  cancellationPolicy?: string | null;
  isOnboarded?: boolean;
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    category: "salon",
    description: "",
    phone: "",
    whatsappNumber: "",
    city: "",
    address: "",
    googleMapsLink: "",
    preferredTone: "friendly",
    reviewLink: "",
    cancellationPolicy: "Cancellations must be made at least 2 hours before the appointment.",
    workingHours: DEFAULT_HOURS,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadBusiness() {
      try {
        const res = await apiFetch<Business | null>("/business");
        console.log("business API response:", res);
        if (cancelled) return;

        setBusinessId(res?.id ?? null);
        console.log("business state:", res?.id ?? null);

        if (res) {
          setForm((current) => ({
            ...current,
            preferredTone: res.preferredTone ?? current.preferredTone,
            reviewLink: res.reviewLink ?? current.reviewLink,
            cancellationPolicy: res.cancellationPolicy ?? current.cancellationPolicy,
          }));
        }
      } catch (err) {
        if (isMissingBusinessResponse(err)) {
          console.log("business API response:", null);
          if (!cancelled) {
            setBusinessId(null);
            console.log("business state:", null);
          }
          return;
        }
        console.error("Business API error:", err);
      }
    }

    loadBusiness();
    return () => {
      cancelled = true;
    };
  }, []);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const defaultServices = [
    { name: "Haircut", category: "hair", price: 300, durationMinutes: 45, isActive: true },
    { name: "Facial", category: "skin", price: 800, durationMinutes: 60, isActive: true },
    { name: "Manicure", category: "nails", price: 400, durationMinutes: 45, isActive: true },
  ];

  async function seedStarterServices() {
    for (const svc of defaultServices) {
      await apiFetch("/services", {
        method: "POST",
        body: JSON.stringify({ ...svc, requiresConsultation: false, requiresTokenAdvance: false }),
      }).catch(() => {});
    }
  }

  async function createBusinessRecord() {
    if (businessId) {
      console.log("business state:", businessId);
      setStep(3);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const created = await apiFetch<Business | null>("/business", {
        method: "POST",
        body: JSON.stringify({ ...form, isOnboarded: false }),
      }).catch(async (err) => {
        if (err instanceof ApiFetchError && err.status === 409) {
          return apiFetch<Business | null>("/business").catch((getErr) => {
            if (isMissingBusinessResponse(getErr)) return null;
            throw getErr;
          });
        }
        throw err;
      });

      console.log("business API response:", created);
      const nextBusinessId = created?.id ?? null;
      setBusinessId(nextBusinessId);
      console.log("business state:", nextBusinessId);

      if (!nextBusinessId) {
        return;
      }

      await seedStarterServices();
      await queryClient.invalidateQueries({ queryKey: ["business"] });
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function submitAiSettings() {
    console.log("business state:", businessId);

    if (!businessId) {
      setStep(4);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await apiFetch<Business | null>("/business", {
        method: "PATCH",
        body: JSON.stringify({
          preferredTone: form.preferredTone,
          reviewLink: form.reviewLink,
          cancellationPolicy: form.cancellationPolicy,
          isOnboarded: true,
        }),
      });
      console.log("business API response:", res);
      setBusinessId(res?.id ?? businessId);
      console.log("business state:", res?.id ?? businessId);
      setSetupComplete(true);
      setStep(4);
    } catch (e: unknown) {
      if (isMissingBusinessResponse(e)) {
        setBusinessId(null);
        console.log("business API response:", null);
        console.log("business state:", null);
        setStep(4);
        return;
      }
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    if (setupComplete && businessId) {
      queryClient.setQueryData(["business"], (current: { id?: number; isOnboarded?: boolean } | null | undefined) => ({
        ...(current ?? {}),
        id: current?.id ?? businessId,
        isOnboarded: true,
      }));
    }
    setLocation("/");
  }

  const dayLabels: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Sparkles className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Welcome to PulseFlow</h1>
          <p className="text-muted-foreground mt-2">Set up your AI front desk in 2 minutes</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.slice(0, 4).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < 3 && <div className={`h-0.5 w-10 ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-card rounded-2xl border border-card-border shadow-sm p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Store className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Your Business</h2>
              </div>
              <div>
                <Label>Business Name *</Label>
                <Input className="mt-1" placeholder="Glamour Studio" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div>
                <Label>Your Name *</Label>
                <Input className="mt-1" placeholder="Priya Sharma" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea className="mt-1" placeholder="Premium beauty salon in the heart of the city..." value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Contact & Location</h2>
              </div>
              <div>
                <Label>Phone Number *</Label>
                <Input className="mt-1" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <Input className="mt-1" placeholder="+91 98765 43210" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Leave blank to use the same as phone</p>
              </div>
              <div>
                <Label>City</Label>
                <Input className="mt-1" placeholder="Mumbai" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div>
                <Label>Address</Label>
                <Textarea className="mt-1" placeholder="123, Main Street, Bandra West, Mumbai" value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <Label>Google Maps Link</Label>
                <Input className="mt-1" placeholder="https://maps.google.com/..." value={form.googleMapsLink} onChange={(e) => set("googleMapsLink", e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Working Hours</h2>
              </div>
              {Object.entries(dayLabels).map(([day, label]) => {
                const hours = form.workingHours[day as keyof typeof form.workingHours];
                return (
                  <div key={day} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={hours.isOpen}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          workingHours: {
                            ...f.workingHours,
                            [day]: { ...f.workingHours[day as keyof typeof f.workingHours], isOpen: e.target.checked },
                          },
                        }))
                      }
                      className="accent-primary"
                    />
                    <span className="w-24 text-sm font-medium">{label.slice(0, 3)}</span>
                    {hours.isOpen ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          value={hours.open}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              workingHours: {
                                ...f.workingHours,
                                [day]: { ...f.workingHours[day as keyof typeof f.workingHours], open: e.target.value },
                              },
                            }))
                          }
                          className="flex-1 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="time"
                          value={hours.close}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              workingHours: {
                                ...f.workingHours,
                                [day]: { ...f.workingHours[day as keyof typeof f.workingHours], close: e.target.value },
                              },
                            }))
                          }
                          className="flex-1 text-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">AI Personality</h2>
              </div>
              <div>
                <Label>AI Tone</Label>
                <Select value={form.preferredTone} onValueChange={(v) => set("preferredTone", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly & Warm</SelectItem>
                    <SelectItem value="professional">Professional & Formal</SelectItem>
                    <SelectItem value="premium">Premium & Exclusive</SelectItem>
                    <SelectItem value="casual">Casual & Fun</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Google Review Link</Label>
                <Input className="mt-1" placeholder="https://g.page/r/..." value={form.reviewLink} onChange={(e) => set("reviewLink", e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">We'll send this after each completed appointment</p>
              </div>
              <div>
                <Label>Cancellation Policy</Label>
                <Textarea
                  className="mt-1"
                  value={form.cancellationPolicy}
                  onChange={(e) => set("cancellationPolicy", e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-4 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-2">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <h2 className="text-xl font-bold">You're all set!</h2>
              <p className="text-muted-foreground text-sm">
                Your AI front desk is ready. We've also added a few sample services to get you started.
              </p>
            </div>
          )}

          <div className="flex justify-between mt-6">
            {step > 0 && step < 4 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>
            )}
            {step < 4 ? (
              <Button
                className="ml-auto"
                onClick={step === 2 ? createBusinessRecord : step === 3 ? submitAiSettings : () => setStep((s) => s + 1)}
                disabled={loading || (step === 0 && (!form.name || !form.ownerName))}
              >
                {loading ? "Saving..." : step === 3 ? "Complete Setup" : "Next ->"}
              </Button>
            ) : (
              <Button className="w-full" onClick={goToDashboard}>Go to Dashboard</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
