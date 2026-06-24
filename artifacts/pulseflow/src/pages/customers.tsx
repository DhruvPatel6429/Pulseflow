import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Users, Search, Phone, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, formatDate, formatTime, formatCurrency, STATUS_COLORS } from "@/lib/api";

interface Customer {
  id: number;
  name: string;
  phone: string;
  notes?: string | null;
  source?: string | null;
  totalVisits: number;
  lastVisitAt?: string | null;
  createdAt: string;
}

interface CustomerDetail extends Customer {
  bookings: Array<{
    id: number;
    bookingDate: string;
    startTime: string;
    status: string;
    service: { name: string; price: number } | null;
  }>;
  upcomingBooking: {
    bookingDate: string;
    startTime: string;
    service: { name: string } | null;
  } | null;
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["customers", page, search],
    queryFn: () => apiFetch(`/customers?${params}`),
  });

  const { data: detail } = useQuery<CustomerDetail>({
    queryKey: ["customer", selectedId],
    queryFn: () => apiFetch(`/customers/${selectedId}`),
    enabled: !!selectedId,
  });

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">{total} total clients</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No customers yet</p>
          <p className="text-sm mt-1">Customers will appear here when bookings are created</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {customers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/40 cursor-pointer transition-colors"
                onClick={() => setSelectedId(c.id)}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />{c.phone}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">{c.totalVisits} visits</p>
                  {c.lastVisitAt && (
                    <p className="text-muted-foreground text-xs">
                      Last: {formatDate(c.lastVisitAt.slice(0, 10))}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>

          {total > 20 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground self-center">Page {page} of {Math.ceil(total / 20)}</span>
              <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {detail.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p>{detail.name}</p>
                    <p className="text-sm font-normal text-muted-foreground">{detail.phone}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-2xl font-bold">{detail.totalVisits}</p>
                    <p className="text-xs text-muted-foreground">Total Visits</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-2xl font-bold">{detail.bookings.filter((b) => b.status === "completed").length}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-2xl font-bold">{detail.bookings.filter((b) => b.status === "no_show").length}</p>
                    <p className="text-xs text-muted-foreground">No Shows</p>
                  </div>
                </div>

                {detail.upcomingBooking && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                    <p className="font-medium text-primary mb-1">Upcoming Appointment</p>
                    <p>{formatDate(detail.upcomingBooking.bookingDate)} at {formatTime(detail.upcomingBooking.startTime)}</p>
                    <p className="text-muted-foreground">{detail.upcomingBooking.service?.name}</p>
                  </div>
                )}

                {detail.notes && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    {detail.notes}
                  </div>
                )}

                {detail.bookings.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Appointment History</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detail.bookings.map((b) => (
                        <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                          <div>
                            <p className="font-medium">{b.service?.name ?? "—"}</p>
                            <p className="text-muted-foreground text-xs">{formatDate(b.bookingDate)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {b.service && <span className="text-muted-foreground">{formatCurrency(b.service.price)}</span>}
                            <Badge className={`text-[10px] ${STATUS_COLORS[b.status]}`}>{b.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Link href={`/bookings/new?phone=${detail.phone}&name=${encodeURIComponent(detail.name)}`}>
                  <Button className="w-full" onClick={() => setSelectedId(null)}>
                    <Calendar className="w-4 h-4 mr-2" />Book Again
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="py-8 text-center"><Skeleton className="h-32 w-full" /></div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
