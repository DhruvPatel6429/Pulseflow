import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarDays, Users, Bot, TrendingUp, Clock,
  CheckCircle2, AlertCircle, IndianRupee, MoreVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, formatCurrency, formatTime, STATUS_COLORS } from "@/lib/api";
import type { Booking, DashboardStats } from "@/types";

interface DashboardStats {
  todayCount: number;
  upcomingCount: number;
  pendingAiActions: number;
  totalCustomers: number;
  completedThisWeek: number;
  revenueThisWeek: number;
  noShowRate: number;
  bookingsByStatus: Array<{ status: string; count: number }>;
  topServices: Array<{ serviceId: number; name: string; count: number; revenue: number }>;
}

interface Booking {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
  service: { name: string; price: number } | null;
  customer: { name: string; phone: string } | null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color ?? "bg-primary/10"}`}>
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
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

  const { data: upcomingBookings } = useQuery<Booking[]>({
    queryKey: ["dashboard-upcoming"],
    queryFn: () => apiFetch("/dashboard/upcoming"),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Link href="/bookings/new">
          <Button>+ New Booking</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard icon={CalendarDays} label="Today's Bookings" value={stats?.todayCount ?? 0} sub={`${stats?.upcomingCount ?? 0} upcoming this week`} />
            <StatCard icon={IndianRupee} label="Revenue This Week" value={formatCurrency(stats?.revenueThisWeek ?? 0)} sub={`${stats?.completedThisWeek ?? 0} completed`} color="bg-green-100" />
            <StatCard icon={Bot} label="Pending AI Actions" value={stats?.pendingAiActions ?? 0} sub="Need your review" color="bg-amber-100" />
            <StatCard icon={Users} label="Total Customers" value={stats?.totalCustomers ?? 0} sub={`${stats?.noShowRate ?? 0}% no-show rate`} color="bg-blue-100" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Today's Schedule</CardTitle>
            <Link href="/bookings"><span className="text-xs text-primary cursor-pointer hover:underline">View all</span></Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : todayBookings?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No bookings today
              </div>
            ) : (
              todayBookings?.slice(0, 6).map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="text-center min-w-[52px]">
                    <p className="text-xs font-semibold text-primary">{formatTime(b.startTime)}</p>
                    <p className="text-[10px] text-muted-foreground">{formatTime(b.endTime)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.customer?.name ?? "Walk-in"}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.service?.name ?? "—"}</p>
                  </div>
                  <Badge className={`text-[10px] ${STATUS_COLORS[b.status]}`}>{b.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Top Services + Upcoming */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Services This Week</CardTitle>
            </CardHeader>
            <CardContent>
              {!stats?.topServices?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              ) : (
                <div className="space-y-2">
                  {stats.topServices.map((s) => (
                    <div key={s.serviceId} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{s.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{s.count}x</span>
                        <span className="font-medium text-green-600">{formatCurrency(s.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {stats && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Booking Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.bookingsByStatus.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <Badge className={`text-[10px] ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-700"}`}>{s.status}</Badge>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
