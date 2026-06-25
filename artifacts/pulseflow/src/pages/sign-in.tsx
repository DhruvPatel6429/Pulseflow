import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">🌸 PulseFlow</h1>
        <p className="text-muted-foreground text-sm mt-1">AI front desk for beauty & wellness</p>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}
