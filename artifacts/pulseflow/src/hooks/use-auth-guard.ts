import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetBusiness, getGetBusinessQueryKey } from "@workspace/api-client-react";

export function useAuthGuard() {
  const [location, setLocation] = useLocation();
  
  const { data: business, isLoading, error } = useGetBusiness({
    query: {
      queryKey: getGetBusinessQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (!isLoading) {
      const status = typeof error === "object" && error && "status" in error
        ? (error as { status?: number }).status
        : undefined;
      const isMissingBusiness = status === 401 || status === 404;

      if (error && !isMissingBusiness) {
        console.error("Business API error:", error);
        if (location !== "/onboarding") {
          setLocation("/onboarding");
        }
      } else if (isMissingBusiness || !business) {
        console.log("business API response:", null);
        if (location !== "/onboarding") {
          setLocation("/onboarding");
        }
      } else if (!business.isOnboarded) {
        console.log("business state:", business.id ?? null);
         if (location !== "/onboarding") {
          setLocation("/onboarding");
        }
      } else if (location === "/onboarding" && business.isOnboarded) {
        console.log("business state:", business.id ?? null);
        setLocation("/");
      }
    }
  }, [business, isLoading, error, location, setLocation]);

  return { business, isLoading, error };
}
