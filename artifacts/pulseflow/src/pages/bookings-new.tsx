import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, formatCurrency, formatTime, todayStr } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: number;
  name: string;
  price: number;
  durationMinutes: number;
  category?: string | null;
  isActive: boolean;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export default function NewBooking() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [selectedSlot, setSelectedSlot] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: () => apiFetch("/services"),
    select: (d) => d.filter((s) => s.isActive),
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery<{ slots: TimeSlot[] }>({
    queryKey: ["available-slots", serviceId, date],
    queryFn: () => apiFetch(`/bookings/available-slots?serviceId=${serviceId}&date=${date}`),
    enabled: !!serviceId && !!date,
  });

  const slots = slotsData?.slots ?? [];
  const availableSlots = slots.filter((s) => s.available);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId || !selectedSlot || !customerName || !customerPhone) {
      toast({ description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify({
          serviceId: parseInt(serviceId, 10),
          bookingDate: date,
          startTime: selectedSlot,
          customerName,
          customerPhone,
          notes: notes || undefined,
          source: "manual",
        }),
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ description: "Booking created successfully!" });
      setLocation("/bookings");
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Failed to create booking",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedService = services.find((s) => String(s.id) === serviceId);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/bookings")}>
          <ArrowLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <div>
          <h1 className="text-xl font-bold">New Booking</h1>
          <p className="text-muted-foreground text-sm">Schedule a new appointment</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Service */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Service *</Label>
            <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setSelectedSlot(""); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} — {formatCurrency(s.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date *</Label>
            <Input
              type="date"
              className="mt-1"
              value={date}
              min={todayStr()}
              onChange={(e) => { setDate(e.target.value); setSelectedSlot(""); }}
            />
          </div>
        </div>

        {/* Service info */}
        {selectedService && (
          <div className="flex items-center gap-4 p-3 bg-primary/5 rounded-lg text-sm">
            <Clock className="w-4 h-4 text-primary" />
            <span>{selectedService.durationMinutes} min · {formatCurrency(selectedService.price)}</span>
          </div>
        )}

        {/* Available Slots */}
        {serviceId && date && (
          <div>
            <Label className="mb-2 block">Available Slots *</Label>
            {slotsLoading ? (
              <p className="text-sm text-muted-foreground">Loading available slots...</p>
            ) : availableSlots.length === 0 ? (
              <p className="text-sm text-destructive">No slots available for this date. Try another date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableSlots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    onClick={() => setSelectedSlot(slot.startTime)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedSlot === slot.startTime
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary"
                    }`}
                  >
                    {formatTime(slot.startTime)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Customer Name *</Label>
            <Input className="mt-1" placeholder="Priya Sharma" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <Label>Phone Number *</Label>
            <Input className="mt-1" placeholder="+91 98765 43210" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea className="mt-1" placeholder="Any special requests or notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating..." : "Create Booking"}
        </Button>
      </form>
    </div>
  );
}
