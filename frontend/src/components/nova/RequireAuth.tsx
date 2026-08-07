import { useRouter, useRouterState } from "@tanstack/react-router";
import * as React from "react";
import { useSession } from "@/lib/session";

/**
 * Client-side route guard for private pages.
 *
 * The session lives in localStorage, so it can't be read during SSR. During
 * the server render this renders a neutral loading state (never private UI),
 * and after hydration it either renders the children or redirects to /login,
 * remembering where the user was headed so login can send them back.
 *
 * This is a UX layer only  every private API endpoint is independently
 * protected by JWT auth on the backend, so unauthenticated calls always fail.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const returnUrl = useRouterState({ select: (s) => s.location.href });
  const { session, ready } = useSession();
  const [redirected, setRedirected] = React.useState(false);

  React.useEffect(() => {
    if (!ready || redirected) return;
    if (!session) {
      setRedirected(true);
      void router.navigate({
        to: "/login",
        search: { redirect: returnUrl },
      });
      return;
    }
    // A session that exists but hasn't finished onboarding belongs on the
    // onboarding flow, not on private banking pages.
    if (session.onboardingIncomplete) {
      setRedirected(true);
      void router.navigate({ to: "/onboarding" });
    }
  }, [ready, session, redirected, router, returnUrl]);

  if (!ready || redirected || !session) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="size-2 animate-ping rounded-full bg-lime" />
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground">
            {redirected ? "Taking you to sign-in…" : "Checking your session…"}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
