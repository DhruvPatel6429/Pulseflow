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
      if (error || !business) {
        if (location !== "/onboarding") {
          setLocation("/onboarding");
        }
      } else if (!business.isOnboarded) {
         if (location !== "/onboarding") {
          setLocation("/onboarding");
        }
      } else if (location === "/onboarding" && business.isOnboarded) {
        setLocation("/");
      }
    }
  }, [business, isLoading, error, location, setLocation]);

  return { business, isLoading, error };
}
