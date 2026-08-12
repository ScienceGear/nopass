import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  ArrowRight,
  ChevronDown,
  Fingerprint,
  MailCheck,
  MousePointerClick,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button, PillBadge, RiskBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { ImageChallenge } from "@/components/nova/ImageChallenge";
import { AuthSplit, type AuthTip } from "@/components/nova/AuthSplit";
import { AuthBackground, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  postLoginOptions,
  postLoginVerify,
  postStepUpVerify,
  postImageChallengeSetup,
  type ImageChallenge as ImageChallengeData,
  type LoginResult,
  ApiError,
} from "@/lib/api";
import { getDeviceFingerprint, getDeviceInfo } from "@/lib/fingerprint";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/login/")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; email?: string } => {
    const out: { redirect?: string; email?: string } = {};
    if (typeof search["redirect"] === "string") out.redirect = search["redirect"];
    if (typeof search["email"] === "string") out.email = search["email"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Sign in to NovaBank with a passkey" },
      {
        name: "description",
        content:
          "One tap with Face ID or Touch ID. No password, no OTP by default  just your device.",
      },
      { property: "og:title", content: "Sign in to NovaBank" },
      { property: "og:description", content: "Passkey sign-in, risk-scored in real time." },
    ],
  }),
  component: LoginPage,
});
type Stage = "email" | "passkey" | "otp" | "challenge";

const loginTips: AuthTip[] = [
  {
    icon: <Fingerprint className="size-4" />,
    title: "A passkey, not a password",
    body: "Your device signs for you with Face ID, Touch ID or Windows Hello.",
  },
  {
    icon: <MailCheck className="size-4" />,
    title: "Email codes as a backup",
    body: "No passkey handy? We email a one-time code to your inbox instead.",
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "Risk-scored in real time",
    body: "Unusual sign-ins get an extra check  or a friendly block.",
  },
  {
    icon: <MousePointerClick className="size-4" />,
    title: "Click-point backup",
    body: "Memorise spots on images and sign in without a passkey when you need to.",
  },
];

function LoginPage() {
  const navigate = useNavigate();
  const { redirect, email: initialEmail } = Route.useSearch();
  const { session } = useSession();
  const [stage, setStage] = React.useState<Stage>("email");
  const [email, setEmail] = React.useState(initialEmail || "");
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [result, setResult] = React.useState<LoginResult | null>(null);
  const [challenge, setChallenge] = React.useState<ImageChallengeData | null>(null);
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showOthers, setShowOthers] = React.useState(false);
  const emailKeys = useKeystrokeCapture();
  const otpKeys = useKeystrokeCapture();

  const goAfterLogin = React.useCallback(() => {
    const dest =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
    setTimeout(() => {
      // Redirect targets come only from RequireAuth and are constrained to a
      // same-origin path. A full navigation preserves query parameters such as
      // the single-use QR approval token.
      window.location.assign(dest);
    }, 900);
  }, [redirect]);

  React.useEffect(() => {
    if (!session) return;
    if (session.onboardingIncomplete) {
      void navigate({ to: "/onboarding" });
      return;
    }
    goAfterLogin();
  }, [session, goAfterLogin, navigate]);

  async function handleLoginResult(res: LoginResult) {
    setResult(res);

    if (res.stepUpRequired && res.method === "image_challenge") {
      setChallenge(res.challenge ?? null);
      setStage("challenge");
      setPhase("idle");
      return;
    }

    if (res.stepUpRequired && res.method === "passkey") {
      // Re-confirm with a fresh passkey gesture.
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);
      const reCredential = await startAuthentication({ optionsJSON: res.options! });
      const stepUp = await postStepUpVerify({
        method: "passkey",
        email,
        credential: reCredential,
        keystrokes: [],
        deviceFingerprint,
        deviceInfo,
      });
      setPhase("success");
      toast.success("Signed in", { description: "Identity confirmed by your device." });
      if (stepUp.onboardingIncomplete) {
        void navigate({ to: "/onboarding" });
      } else {
        goAfterLogin();
      }
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
      goAfterLogin();
      return;
    }

    setPhase("idle");
  }

  async function solveChallenge(challengeToken: string, clicks: { x: number; y: number }[]) {
    const [deviceFingerprint, deviceInfo] = await Promise.all([
      getDeviceFingerprint(),
      Promise.resolve(getDeviceInfo()),
    ]);
    await postStepUpVerify({
      method: "image_challenge",
      email,
      challengeToken,
      clicks,
      keystrokes: [],
      deviceFingerprint,
      deviceInfo,
    });
    setPhase("success");
    toast.success("It's you  welcome back", { description: "Extra check passed." });
    goAfterLogin();
  }

  async function newChallenge() {
    const next = await postImageChallengeSetup(email);
    setChallenge(next);
    setResult((r) => (r ? { ...r, challenge: next } : r));
  }

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
      await handleLoginResult(res);
    } catch (err) {
      setPhase("error");
      if (err instanceof ApiError && err.code === "EMAIL_UNVERIFIED") {
        setError(
          "Your email isn't verified yet. Check your inbox for the link we sent, then try again.",
        );
      } else if (err instanceof ApiError && err.code === "NO_PASSKEY") {
        setError(
          "You haven't set up a passkey yet. Use the 'Email me a code' option below to finish creating your account.",
        );
        setShowOthers(true);
      } else {
        setError(friendlyWebAuthnError(err));
      }
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
      const stepUp = await postStepUpVerify({
        method: "otp_email",
        email,
        otp,
        keystrokes,
        deviceFingerprint,
        deviceInfo,
      });
      setPhase("success");
      toast.success("It's you  welcome back");
      if (stepUp.onboardingIncomplete) {
        void navigate({ to: "/onboarding" });
      } else {
        setTimeout(() => navigate({ to: "/dashboard" }), 900);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setBusy(false);
    }
  }

  /* High risk -> full-screen block */
  if (result?.riskAction === "block") {
    return (
      <AuthBackground>
        <AuthSplit
          eyebrow="Risk engine"
          headline="We stopped this sign-in"
          subline="Our adaptive risk engine flagged this attempt to protect you."
          badge={
            <PillBadge tone="white" icon={<ShieldAlert className="size-3.5" />}>
              Blocked
            </PillBadge>
          }
          tips={loginTips}
        >
          <Reveal className="w-full max-w-[30rem] text-center">
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
        </AuthSplit>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <AuthSplit
        eyebrow="Passkeys"
        headline="Sign in without a password."
        subline="One tap with Face ID, Touch ID or Windows Hello. No password, no OTP by default."
        badge={
          <PillBadge tone="white" icon={<ShieldCheck className="size-3.5" />}>
            Passkey sign-in
          </PillBadge>
        }
        tips={loginTips}
      >
        <Reveal className="w-full max-w-[26rem]">
          <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-5 text-center shadow-card sm:px-6 sm:py-6">
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

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    const search: { email?: string; redirect?: string } = {};
                    if (email) search.email = email;
                    if (redirect) search.redirect = redirect;
                    navigate({ to: "/login/pccp", search });
                  }}
                >
                  <MousePointerClick className="size-4" />
                  Sign in with click-points
                </Button>

                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  className="flex w-full items-center justify-between border-t border-[oklch(0.207_0.014_251_/_0.07)] pt-4 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                >
                  Other ways to sign in
                  <ChevronDown
                    className={`size-4 transition-transform duration-200 ${showOthers ? "rotate-180" : ""}`}
                  />
                </button>
                {showOthers ? (
                  <div className="space-y-2">
                    <OtherMethod
                      label="Email me a code"
                      hint="No passkey needed  we email a one-time sign-in link."
                      onClick={() => navigate({ to: "/recover" })}
                    />
                    <OtherMethod
                      label="Recovery code"
                      hint="Use one of the 10 codes you saved at signup."
                      onClick={() => navigate({ to: "/recover" })}
                    />
                    <OtherMethod
                      label="Sign in with click-points"
                      hint="Click memorable spots on images — no passkey needed."
                      onClick={() => {
                        const search: { email?: string; redirect?: string } = { email };
                        if (redirect) search.redirect = redirect;
                        navigate({ to: "/login/pccp", search });
                      }}
                    />
                    <OtherMethod
                      label="Sign in on another device"
                      hint="Scan a QR code with a device that already has your passkey."
                      onClick={() => navigate({ to: "/login/approve" })}
                    />
                  </div>
                ) : null}
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
            ) : stage === "challenge" ? (
              <div className="space-y-6 text-left">
                <div className="space-y-2 text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-warning/14 text-[oklch(0.58_0.13_70)]">
                    <ShieldCheck className="size-7" />
                  </span>
                  <h1 className="pt-3 text-2xl">One last check</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    We noticed something unusual about this sign-in. Click the objects below in the
                    order shown to prove it&apos;s you.
                  </p>
                </div>
                {result ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="eyebrow">Session risk</span>
                    <RiskBadge level={result.riskLevel} score={result.riskScore} />
                  </div>
                ) : null}
                {challenge ? (
                  <ImageChallenge
                    challenge={challenge}
                    busy={busy}
                    onSolve={solveChallenge}
                    onNewChallenge={newChallenge}
                  />
                ) : null}
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

            {/* Quick links inside the card */}
            <div className={"mt-6 space-y-3 border-t border-hairline pt-5"}>
              <p className="text-sm text-muted-foreground">
                New here?{" "}
                <Link
                  to="/signup"
                  className="font-semibold text-ink underline-offset-4 hover:underline"
                >
                  Open an account
                </Link>
              </p>
              <Link
                to="/login/approve"
                className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
              >
                <QrCode className="size-4" /> Sign in on another device
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                to="/recover"
                className="block text-center text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
              >
                Lost access? Recover your account securely
              </Link>
            </div>
          </div>
        </Reveal>
      </AuthSplit>
    </AuthBackground>
  );
}

function OtherMethod({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[oklch(0.207_0.014_251_/_0.07)] px-4 py-3 text-left transition-colors hover:border-lime/40 hover:bg-lime/5"
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Turn raw WebAuthn/browser errors into plain language for the user. */
function friendlyWebAuthnError(err: unknown): string {
  if (!(err instanceof Error)) return "Sign-in failed. Please try again.";
  const name = err.name ?? "";
  const message = err.message ?? "";
  const lower = `${name} ${message}`.toLowerCase();
  if (lower.includes("notallowed") || lower.includes("timed out") || lower.includes("timeout")) {
    return "The security prompt was closed or timed out. Try again and complete the prompt when it appears.";
  }
  if (lower.includes("cancel")) {
    return "The security prompt was closed. Try again when you're ready to confirm.";
  }
  if (lower.includes("abort")) {
    return "Sign-in was interrupted. Please try again.";
  }
  if (lower.includes("no passkey") || lower.includes("not registered") || lower.includes("notfound")) {
    return "No passkey was found for this account on this device. Try another way to sign in below.";
  }
  if (lower.includes("security error") || lower.includes("attestation")) {
    return "Your device couldn't complete the secure check. Try again or use another way to sign in.";
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to load")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (message === "[object Object]") return "Sign-in failed. Please try again.";
  return message;
}
