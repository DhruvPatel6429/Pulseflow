import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, CalendarDays, Users, Scissors,
  MessageSquare, Zap, Settings, Bot, Sparkles,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/bookings", icon: CalendarDays, label: "Bookings" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/services", icon: Scissors, label: "Services" },
  { to: "/inbox", icon: MessageSquare, label: "AI Inbox" },
  { to: "/automations", icon: Zap, label: "Automations" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-60 shrink-0 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sidebar-foreground text-sm">PulseFlow</p>
            <p className="text-[10px] text-muted-foreground">AI Front Desk</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === "/" ? location === "/" : location.startsWith(to);
          return (
            <Link key={to} href={to}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* WhatsApp status */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Bot className="w-4 h-4" />
          <span>AI Auto-Reply</span>
          <span className="ml-auto w-2 h-2 rounded-full bg-green-500" />
        </div>
      </div>
    </aside>
  );
}
