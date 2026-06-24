import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, Plus, Search, CheckCircle, XCircle, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, formatCurrency, formatDate, formatTime, todayStr, STATUS_COLORS } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Booking {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string | null;
  source: string;
  createdByAI: boolean;
  service: { id: number; name: string; price: number; durationMinutes: number } | null;
  customer: { id: number; name: string; phone: string } | null;
}

const STATUSES = ["all", "pending", "confirmed", "completed", "cancelled", "no_show", "rescheduled"];

export default function Bookings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (dateFilter) params.set("date", dateFilter);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings", statusFilter, dateFilter],
    queryFn: () => apiFetch(`/bookings?${params}`),
    refetchInterval: 15000,
  });

  const filtered = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.customer?.name.toLowerCase().includes(q) ||
      b.service?.name.toLowerCase().includes(q) ||
      b.customer?.phone.includes(q)
    );
  });

  function updateStatus(id: number, endpoint: string) {
    return apiFetch(`/bookings/${id}/${endpoint}`, { method: "POST" }).then(() => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelected(null);
      toast({ description: `Booking ${endpoint}d successfully` });
    });
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} appointments</p>
        </div>
        <Link href="/bookings/new">
          <Button><Plus className="w-4 h-4 mr-2" />New Booking</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search customer or service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-44"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {(statusFilter !== "all" || dateFilter) && (
          <Button variant="outline" onClick={() => { setStatusFilter("all"); setDateFilter(""); }}>Clear</Button>
        )}
      </div>

      {/* Quick date buttons */}
      <div className="flex gap-2">
        <Button size="sm" variant={dateFilter === todayStr() ? "default" : "outline"} onClick={() => setDateFilter(todayStr())}>Today</Button>
        <Button size="sm" variant={dateFilter === "" ? "default" : "outline"} onClick={() => setDateFilter("")}>All Dates</Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No bookings found</p>
          <p className="text-sm mt-1">Try adjusting your filters or create a new booking</p>
          <Link href="/bookings/new"><Button className="mt-4">+ New Booking</Button></Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-colors"
              onClick={() => setSelected(b)}
            >
              <div className="text-center min-w-[64px]">
                <p className="text-xs text-muted-foreground">{formatDate(b.bookingDate)}</p>
                <p className="text-sm font-semibold text-primary">{formatTime(b.startTime)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.customer?.name ?? "Walk-in"}</p>
                <p className="text-sm text-muted-foreground truncate">{b.service?.name} · {b.service ? formatCurrency(b.service.price) : "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                {b.createdByAI && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                <Badge className={`text-[10px] ${STATUS_COLORS[b.status]}`}>{b.status}</Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Booking #{selected.id}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Customer</p><p className="font-medium">{selected.customer?.name ?? "Walk-in"}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{selected.customer?.phone ?? "—"}</p></div>
                  <div><p className="text-muted-foreground">Service</p><p className="font-medium">{selected.service?.name ?? "—"}</p></div>
                  <div><p className="text-muted-foreground">Price</p><p className="font-medium">{selected.service ? formatCurrency(selected.service.price) : "—"}</p></div>
                  <div><p className="text-muted-foreground">Date</p><p className="font-medium">{formatDate(selected.bookingDate)}</p></div>
                  <div><p className="text-muted-foreground">Time</p><p className="font-medium">{formatTime(selected.startTime)} – {formatTime(selected.endTime)}</p></div>
                  <div><p className="text-muted-foreground">Status</p><Badge className={`${STATUS_COLORS[selected.status]}`}>{selected.status}</Badge></div>
                  <div><p className="text-muted-foreground">Source</p><p className="font-medium capitalize">{selected.source}</p></div>
                </div>
                {selected.notes && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    {selected.notes}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {selected.status === "pending" && (
                    <Button size="sm" onClick={() => updateStatus(selected.id, "confirm")}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />Confirm
                    </Button>
                  )}
                  {["pending", "confirmed"].includes(selected.status) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "complete")}>
                        Complete
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "no-show")}>
                        No Show
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(selected.id, "cancel")}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
