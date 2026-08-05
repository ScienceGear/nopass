import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, Fingerprint, MailCheck, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, PillBadge, RiskBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { postLoginOptions, postLoginVerify, postOtpVerify, type LoginResult } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { toast } from "sonner";
import type { RiskLevel } from "@/lib/mockData";

export const Route = createFileRoute("/login/")({
  validateSearch: (search: Record<string, unknown>) => ({
    risk: (["low", "medium", "high"] as const).includes(search["risk"] as RiskLevel)
      ? (search["risk"] as RiskLevel)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in to NovaBank with a passkey" },
      {
        name: "description",
        content:
          "One tap with Face ID or Touch ID. No password, no OTP by default — just your device.",
      },
      { property: "og:title", content: "Sign in to NovaBank" },
      { property: "og:description", content: "Passkey sign-in, risk-scored in real time." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { risk } = Route.useSearch();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [result, setResult] = React.useState<LoginResult | null>(null);
  const [otp, setOtp] = React.useState("");
  const [otpBusy, setOtpBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function signIn() {
    setPhase("waiting");
    setError(null);
    await postLoginOptions();
    const res = await postLoginVerify({ simulateRisk: risk ?? "low" });
    setResult(res);
    if (res.riskAction === "allow") {
      setPhase("success");
      saveSession({ token: res.session?.token ?? "demo", name: "Rohan Patil" });
      toast.success("Signed in", { description: res.reason });
      setTimeout(() => navigate({ to: "/dashboard" }), 900);
    } else {
      setPhase("idle");
    }
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault();
    setOtpBusy(true);
    setError(null);
    try {
      await postOtpVerify({ code: otp });
      saveSession({ token: "demo", name: "Rohan Patil" });
      toast.success("It's you — welcome back");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setOtpBusy(false);
    }
  }

  /* High risk → full-screen block */
  if (result?.riskAction === "block") {
    return (
      <NovaBackground>
        <PageShell className="min-h-[calc(100vh-4rem)]">
          <header className="py-4">
            <Logo />
          </header>
          <div className="flex min-h-[70vh] items-center justify-center">
            <Reveal className="w-full max-w-[32rem] text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-destructive/10 text-destructive">
                <ShieldAlert className="size-8" />
              </span>
              <h1 className="mt-6 text-3xl">We stopped this sign-in</h1>
              <p className="mx-auto mt-3 max-w-[26rem] text-sm leading-relaxed text-muted-foreground">
                {result.reason}
              </p>
              <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-muted p-4 text-left">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Risk score</span>
                  <RiskBadge level="high" score={result.riskScore} />
                </div>
              </div>
              <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  variant="danger"
                  size="lg"
                  onClick={() => toast.success("Reported — we've locked new sessions for 24 hours")}
                >
                  This wasn&apos;t me
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link to="/login/approve">It was me, verify another way</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </PageShell>
      </NovaBackground>
    );
  }

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <PillBadge tone="white" icon={<ShieldCheck />}>
            {risk ? `Demo: ${risk} risk` : "FIDO2 sign-in"}
          </PillBadge>
        </header>

        <div className="flex flex-col items-center justify-center py-12 sm:py-20">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 text-center shadow-card sm:p-8">
              {result?.riskAction === "step_up" ? (
                <form onSubmit={confirmOtp} className="space-y-6">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-warning/14 text-[oklch(0.58_0.13_70)]">
                    <MailCheck className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Confirm it&apos;s you</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {result.reason} We emailed a 6-digit code to r••••@hey.com.
                    </p>
                  </div>
                  <Input
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="••••••"
                    className="tnum h-14 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                  />
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="lg" className="w-full" disabled={otpBusy}>
                    {otpBusy ? "Checking…" : "Confirm and sign in"}
                  </Button>
                  <div className="flex items-center justify-center gap-2">
                    <span className="eyebrow">Session risk</span>
                    <RiskBadge level="medium" score={result.riskScore} />
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <PasskeyGlyph phase={phase} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Welcome back</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {phase === "waiting"
                        ? "Waiting for your device… confirm the prompt on your screen."
                        : "Your passkey only works on the real NovaBank domain, so a lookalike site can't use it."}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={phase === "waiting" || phase === "success"}
                    onClick={signIn}
                  >
                    <Fingerprint className="size-[1.05rem]" />
                    {phase === "waiting" ? "Waiting for your device…" : "Sign in with passkey"}
                  </Button>
                  <Link
                    to="/login/approve"
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                  >
                    <QrCode className="size-4" /> Sign in on another device
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                to="/signup"
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                Open an account
              </Link>
            </p>
            <p className="mt-3 text-center font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground/70">
              demo states · ?risk=low · medium · high
            </p>
          </Reveal>
        </div>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
