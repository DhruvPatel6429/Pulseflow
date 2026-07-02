import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClerkProvider,
  Show,
  useClerk,
  RedirectToSignIn,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
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
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import NotFound from "@/pages/not-found";
import { apiFetch, isMissingBusinessResponse } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

// REQUIRED — resolves publishable key from hostname (supports custom domains)
const clerkPubKey =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
    : publishableKeyFromHost(
        window.location.hostname,
        import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
      );

// REQUIRED — empty in dev (Clerk hits dev FAPI directly), auto-set in prod
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — check your environment secrets");
}

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "hsl(340, 45%, 45%)",
    colorForeground: "hsl(340, 40%, 15%)",
    colorMutedForeground: "hsl(340, 20%, 45%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(340, 10%, 98%)",
    colorInput: "hsl(340, 15%, 85%)",
    colorInputForeground: "hsl(340, 40%, 15%)",
    colorNeutral: "hsl(340, 15%, 85%)",
    fontFamily: "inherit",
    borderRadius: "0.5rem",
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
});

/** Clears TanStack Query cache when the signed-in user changes */
function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prevRef.current !== undefined && prevRef.current !== uid) {
        qc.clear();
      }
      prevRef.current = uid;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
}

function AppGuard() {
  const [location] = useLocation();

  const { data: business, isLoading } = useQuery<{ id?: number; isOnboarded: boolean } | null>({
    queryKey: ["business"],
    queryFn: async () => {
      try {
        const res = await apiFetch<{ id?: number; isOnboarded: boolean } | null>("/business");
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
    staleTime: 60000,
  });
  const businessId = business?.id ?? null;
  console.log("business state:", businessId);

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

  if (!business?.isOnboarded && location !== "/onboarding") {
    return <Onboarding />;
  }

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

function AppRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back to PulseFlow", subtitle: "Sign in to manage your salon" } },
        signUp: { start: { title: "Join PulseFlow", subtitle: "AI front desk for beauty & wellness" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkCacheInvalidator />
        <TooltipProvider>
          <Switch>
            {/* Auth pages — accessible when signed out */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            {/* Protected app — require sign-in */}
            <Route>
              <Show when="signed-in">
                <AppGuard />
              </Show>
              <Show when="signed-out">
                <RedirectToSignIn />
              </Show>
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
    </WouterRouter>
  );
}

export default App;
