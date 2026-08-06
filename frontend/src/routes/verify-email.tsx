import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, Check, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/nova/primitives";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { postVerifyEmail } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => {
    const token = typeof search["token"] === "string" ? search["token"] : undefined;
    return token ? { token } : {};
  },
  head: () => ({
    meta: [
      { title: "Verify your email — NovaBank" },
      {
        name: "description",
        content: "Confirm your email address to finish opening your NovaBank account.",
      },
    ],
  }),
  component: VerifyEmail,
});

type Status = "verifying" | "verified" | "failed";

function VerifyEmail() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = React.useState<Status>("verifying");
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setStatus("failed");
      setMessage("This link is missing its verification token. Start signup again.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await postVerifyEmail(token);
        if (cancelled) return;
        setStatus("verified");
        toast.success("Email verified", { description: `Thanks — ${res.email} is confirmed.` });
        void navigate({ to: "/onboarding" });
      } catch (err) {
        if (cancelled) return;
        setStatus("failed");
        setMessage(err instanceof Error ? err.message : "This link didn't work.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="py-4">
          <Logo />
        </header>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 text-center shadow-card sm:p-8">
              {status === "verifying" ? (
                <div className="space-y-4">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </span>
                  <h1 className="text-2xl">Verifying your email…</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    One moment while we confirm the link.
                  </p>
                </div>
              ) : status === "verified" ? (
                <div className="space-y-5">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success/14 text-[oklch(0.52_0.14_152)]">
                    <Check className="size-7" strokeWidth={2.4} />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Email verified</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Your address is confirmed. We&apos;re taking you through the final security
                      setup.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => navigate({ to: "/onboarding" })}
                  >
                    Continue setup <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                    <ShieldAlert className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Link invalid or expired</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {message ?? "This verification link is no longer valid."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full"
                      onClick={() => navigate({ to: "/signup" })}
                    >
                      Re-start signup
                    </Button>
                    <Link
                      to="/login"
                      className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                    >
                      Already have an account? Sign in
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
