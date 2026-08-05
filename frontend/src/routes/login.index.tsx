import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { ArrowRight, Fingerprint, MailCheck, QrCode, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, PillBadge, RiskBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postLoginOptions, postLoginVerify, postStepUpVerify, type LoginResult } from "@/lib/api";
import { getDeviceFingerprint, getDeviceInfo } from "@/lib/fingerprint";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/login/")({
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

type Stage = "email" | "passkey" | "otp";

function LoginPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [stage, setStage] = React.useState<Stage>("email");
  const [email, setEmail] = React.useState("");
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [result, setResult] = React.useState<LoginResult | null>(null);
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const emailKeys = useKeystrokeCapture();
  const otpKeys = useKeystrokeCapture();

  React.useEffect(() => {
    if (session) navigate({ to: "/dashboard" });
  }, [session, navigate]);

  async function startLogin(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!browserSupportsWebAuthn()) {
        setError("This browser doesn't support passkeys yet. Try Chrome, Edge or Safari.");
        setBusy(false);
        return;
      }
      const keystrokes = emailKeys.getSamples();
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);

      const { options } = await postLoginOptions({ email });
      setStage("passkey");
      setPhase("waiting");

      const credential = await startAuthentication({ optionsJSON: options });
      const res = await postLoginVerify({
        email,
        credential,
        keystrokes,
        deviceFingerprint,
        deviceInfo,
      });
      setResult(res);

      if (res.stepUpRequired && res.method === "passkey") {
        // Re-confirm with a fresh passkey gesture.
        const reCredential = await startAuthentication({ optionsJSON: res.options! });
        await postStepUpVerify({
          method: "passkey",
          email,
          credential: reCredential,
          keystrokes: [],
          deviceFingerprint,
          deviceInfo,
        });
        setPhase("success");
        toast.success("Signed in", { description: "Identity confirmed by your device." });
        setTimeout(() => navigate({ to: "/dashboard" }), 900);
        return;
      }

      if (res.stepUpRequired && res.method === "otp_email") {
        setStage("otp");
        setOtp(res.devOtp ?? "");
        setPhase("idle");
        return;
      }

      if (res.riskAction === "allow") {
        setPhase("success");
        toast.success("Signed in", { description: res.reason });
        setTimeout(() => navigate({ to: "/dashboard" }), 900);
        return;
      }

      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keystrokes = otpKeys.getSamples();
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);
      await postStepUpVerify({
        method: "otp_email",
        email,
        otp,
        keystrokes,
        deviceFingerprint,
        deviceInfo,
      });
      setPhase("success");
      toast.success("It's you — welcome back");
      setTimeout(() => navigate({ to: "/dashboard" }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setBusy(false);
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
                <Button variant="outline" size="lg" asChild>
                  <Link to="/login/approve">Verify another way</Link>
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
            FIDO2 sign-in
          </PillBadge>
        </header>

        <div className="flex flex-col items-center justify-center py-12 sm:py-20">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 text-center shadow-card sm:p-8">
              {stage === "email" ? (
                <form onSubmit={startLogin} className="space-y-6 text-left">
                  <div className="space-y-2 text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                      <Fingerprint className="size-7" />
                    </span>
                    <h1 className="pt-3 text-2xl">Welcome back</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Enter your email and we&apos;ll ask your device to sign the challenge. No
                      password, ever.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={emailKeys.onKeyDown}
                      placeholder="you@email.com"
                      className="h-12 rounded-2xl"
                    />
                  </div>
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    Continue <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : stage === "passkey" ? (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <PasskeyGlyph phase={phase} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Confirm with your device</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {phase === "waiting"
                        ? "Waiting for your device… confirm the prompt on your screen."
                        : "Your passkey only works on the real NovaBank domain, so a lookalike site can't use it."}
                    </p>
                  </div>
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={phase === "waiting" || busy}
                    onClick={() => startLogin()}
                  >
                    <Fingerprint className="size-[1.05rem]" />
                    {phase === "waiting" ? "Waiting for your device…" : "Sign in with passkey"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setStage("email");
                      setError(null);
                      setPhase("idle");
                    }}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                  >
                    ← Use a different email
                  </button>
                </div>
              ) : (
                <form onSubmit={confirmOtp} className="space-y-6">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-warning/14 text-[oklch(0.58_0.13_70)]">
                    <MailCheck className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Confirm it&apos;s you</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {result?.reason ?? ""} We emailed a 6-digit code to your inbox.
                    </p>
                  </div>
                  <Input
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={otpKeys.onKeyDown}
                    placeholder="••••••"
                    className="tnum h-14 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                  />
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? "Checking…" : "Confirm and sign in"}
                  </Button>
                  {result ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="eyebrow">Session risk</span>
                      <RiskBadge level={result.riskLevel} score={result.riskScore} />
                    </div>
                  ) : null}
                </form>
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
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center">
              <Link
                to="/login/approve"
                className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
              >
                <QrCode className="size-4" /> Sign in on another device
                <ArrowRight className="size-3.5" />
              </Link>
            </p>
          </Reveal>
        </div>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
