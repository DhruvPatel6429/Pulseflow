import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/dashboard";
import Bookings from "@/pages/bookings";
import NewBooking from "@/pages/bookings-new";
import Customers from "@/pages/customers";
import Services from "@/pages/services";
import Inbox from "@/pages/inbox";
import Automations from "@/pages/automations";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

function AppGuard() {
  const [location] = useLocation();

  const { data: business, isLoading } = useQuery<{ isOnboarded: boolean } | null>({
    queryKey: ["business"],
    queryFn: () =>
      apiFetch<{ isOnboarded: boolean }>("/business").catch(() => null),
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // Not onboarded → always show onboarding
  if (!business?.isOnboarded && location !== "/onboarding") {
    return <Onboarding />;
  }

  // Onboarding complete → wrap with app layout
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/bookings/new" component={NewBooking} />
        <Route path="/bookings" component={Bookings} />
        <Route path="/customers" component={Customers} />
        <Route path="/services" component={Services} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/automations" component={Automations} />
        <Route path="/settings" component={Settings} />
        <Route path="/onboarding" component={Onboarding} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppGuard />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
