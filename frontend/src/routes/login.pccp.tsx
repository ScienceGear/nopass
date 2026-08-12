import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { ArrowRight, Fingerprint, Lock, MousePointerClick, ShieldCheck } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { PccpChallenge } from "@/components/nova/PccpChallenge";
import { AuthSplit, type AuthTip } from "@/components/nova/AuthSplit";
import { AuthBackground, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  postPccpLoginInit,
  postPccpLoginVerify,
  postPccpStepupConfirm,
  type PccpDeviceClass,
  type PccpImage,
  type PccpLoginVerifyResult,
  ApiError,
} from "@/lib/api";
import { getDeviceFingerprint, getDeviceInfo } from "@/lib/fingerprint";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { useSession, saveSession } from "@/lib/session";
import { toast } from "sonner";

/**
 * PCCP click-point login — reproduce the memorable spots chosen at setup, with
 * no passkey required. The fullscreen capture is shared with registration
 * (PccpChallenge) and sends normalised coords + timing; the backend hard-gates
 * on the click-points and uses timing only as a soft risk signal.
 */

export const Route = createFileRoute("/login/pccp")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string; email?: string } => {
    const out: { redirect?: string; email?: string } = {};
    if (typeof search["redirect"] === "string") out.redirect = search["redirect"];
    if (typeof search["email"] === "string") out.email = search["email"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Sign in with click-points  NovaBank" },
      {
        name: "description",
        content:
          "Click the same spots on your images to sign in — no password, no passkey required.",
      },
    ],
  }),
  component: PccpLoginPage,
});

type Stage = "email" | "capturing" | "stepup" | "locked";

const pccpLoginTips: AuthTip[] = [
  {
    icon: <MousePointerClick className="size-4" />,
    title: "Your memory is the key",
    body: "You chose three spots during setup — click the same spots again to sign in.",
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "Only a 1-cell window",
    body: "Each spot must land within a small tolerance of the point you memorised.",
  },
  {
    icon: <Fingerprint className="size-4" />,
    title: "Timing never blocks you",
    body: "How you click shapes risk scoring, but only the spots themselves unlock the door.",
  },
];

function detectDeviceClass(): PccpDeviceClass {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 768;
  return coarse && narrow ? "mobile" : "desktop";
}

function PccpLoginPage() {
  const navigate = useNavigate();
  const { redirect, email: initialEmail } = Route.useSearch();
  const { session } = useSession();
  const [stage, setStage] = React.useState<Stage>("email");
  const [email, setEmail] = React.useState(initialEmail || "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");

  // Login-attempt state returned by init, kept across a rejected retry.
  const [loginToken, setLoginToken] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<PccpImage[]>([]);
  const [order, setOrder] = React.useState<string[]>([]);
  const [attemptKey, setAttemptKey] = React.useState(0);
  const [lockoutUntil, setLockoutUntil] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PccpLoginVerifyResult | null>(null);

  const emailKeys = useKeystrokeCapture();
  const imageById = React.useMemo(() => new Map(images.map((img) => [img.id, img])), [images]);
  const orderedImages = React.useMemo(
    () => order.map((id) => imageById.get(id)!).filter(Boolean),
    [order, imageById],
  );

  const goAfterLogin = React.useCallback(() => {
    const dest =
      redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
    setTimeout(() => {
      // Redirect targets come only from RequireAuth and are constrained to a
      // same-origin path.
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

  async function handleInit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);
      const res = await postPccpLoginInit({ email, deviceFingerprint, deviceInfo });
      if (res.status === "locked") {
        setLockoutUntil(res.lockoutUntil ?? null);
        setStage("locked");
        return;
      }
      setLoginToken(res.token);
      setImages(res.images);
      setOrder(res.order);
      setAttemptKey((k) => k + 1);
      setStage("capturing");
    } catch (err) {
      if (err instanceof ApiError && err.code === "NO_PCCP") {
        setError(
          "No click-point login set up for this account yet. Set one up in Security settings, or sign in with a passkey.",
        );
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Couldn't start click-point sign-in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(clicks: Parameters<typeof postPccpLoginVerify>[0]["clicks"]) {
    if (!loginToken) return;
    setBusy(true);
    setError(null);
    try {
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);
      const res = await postPccpLoginVerify({
        token: loginToken,
        clicks,
        deviceClass: detectDeviceClass(),
        deviceFingerprint,
        deviceInfo,
        keystrokes: emailKeys.getSamples(),
      });

      if (res.status === "success") {
        setResult(res);
        if (res.user) {
          saveSession({
            accessToken: res.accessToken!,
            refreshToken: res.refreshToken!,
            name: res.user.name,
            email: res.user.email,
            ...(res.user.onboardingIncomplete !== undefined
              ? { onboardingIncomplete: res.user.onboardingIncomplete }
              : {}),
          });
        }
        setPhase("success");
        toast.success("Signed in", { description: "Click-points matched — welcome back." });
        if (res.user?.onboardingIncomplete) {
          void navigate({ to: "/onboarding" });
        } else {
          goAfterLogin();
        }
        return;
      }

      if (res.status === "stepup_required") {
        // Timing looked off — re-confirm identity with a passkey gesture.
        setResult(res);
        setStage("stepup");
        setPhase("waiting");
        await confirmStepup(res);
        return;
      }

      if (res.status === "locked") {
        setLockoutUntil(res.lockoutUntil ?? null);
        setStage("locked");
        return;
      }

      // rejected — exit the fullscreen capture and show what happened.
      setStage("email");
      setError(
        res.reason === "timing_anomaly"
          ? "This attempt was flagged as unusual and stopped. Try again, or sign in with a passkey."
          : `Click-points didn't match${
              res.attemptsLeft !== undefined ? ` — ${res.attemptsLeft} attempt(s) left` : ""
            }. Try again, or use a passkey instead.`,
      );
    } catch (err) {
      setStage("email");
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmStepup(res: PccpLoginVerifyResult) {
    if (!res.stepupToken || !res.options) return;
    try {
      const [deviceFingerprint, deviceInfo] = await Promise.all([
        getDeviceFingerprint(),
        Promise.resolve(getDeviceInfo()),
      ]);
      const credential = await startAuthentication({ optionsJSON: res.options });
      const stepUp = await postPccpStepupConfirm({
        token: res.stepupToken,
        credential,
        deviceFingerprint,
        deviceInfo,
        keystrokes: emailKeys.getSamples(),
      });
      setPhase("success");
      toast.success("Signed in", { description: "Identity confirmed by your device." });
      if (stepUp.onboardingIncomplete) {
        void navigate({ to: "/onboarding" });
      } else {
        goAfterLogin();
      }
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error && err.message
          ? err.message
          : "The extra security check didn't complete. Try again.",
      );
    }
  }

  const lockLabel = React.useMemo(() => {
    if (!lockoutUntil) return "for a while";
    const ms = new Date(lockoutUntil).getTime() - Date.now();
    if (ms <= 0) return "shortly";
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `for about ${mins} min`;
    const hours = Math.ceil(mins / 60);
    return `for about ${hours} hr`;
  }, [lockoutUntil]);

  return (
    <>
      <AuthBackground>
        <AuthSplit
          eyebrow="Click-Points"
          headline="Sign in with your memory."
          subline="Click the same spots you chose during setup — no password, no passkey required."
          badge={
            <PillBadge tone="white" icon={<MousePointerClick className="size-3.5" />}>
              Click-point sign-in
            </PillBadge>
          }
          tips={pccpLoginTips}
        >
          <Reveal className="w-full max-w-[26rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-5 text-center shadow-card sm:px-6 sm:py-6">
              {stage === "email" ? (
                <form onSubmit={handleInit} className="space-y-6 text-left">
                  <div className="space-y-2 text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                      <MousePointerClick className="size-7" />
                    </span>
                    <h1 className="pt-3 text-2xl">Welcome back</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Enter your email and we&apos;ll show you the three pictures from your setup.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pccp-email">Email</Label>
                    <Input
                      id="pccp-email"
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
                    {busy ? "Starting…" : "Show my pictures"} <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : stage === "stepup" ? (
                <div className="space-y-6">
                  <div className="flex justify-center">
                    <PasskeyGlyph phase={phase} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl">One last check</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Your clicks looked a little off. Confirm it&apos;s you with your passkey to
                      finish signing in.
                    </p>
                  </div>
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  {result?.stepupToken && result.options ? (
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={phase === "waiting" || busy}
                      onClick={() => confirmStepup(result)}
                    >
                      <Fingerprint className="size-[1.05rem]" />
                      {phase === "waiting" ? "Waiting for your device…" : "Confirm with passkey"}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setStage("email");
                      setError(null);
                      setPhase("idle");
                    }}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                  >
                    ← Back to email
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-destructive/10 text-destructive">
                    <Lock className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Click-point login is locked</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Too many failed attempts. Try again {lockLabel} — or sign in with your passkey
                      right now.
                    </p>
                  </div>
                  <Button size="lg" className="w-full" asChild>
                    <Link to="/login">Sign in with a passkey</Link>
                  </Button>
                </div>
              )}

              <div className="mt-6 space-y-3 border-t border-hairline pt-5">
                <p className="text-sm text-muted-foreground">
                  Prefer a passkey?{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    Sign in with your device
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </AuthSplit>
      </AuthBackground>

      {stage === "capturing" && loginToken && orderedImages.length > 0 ? (
        <PccpChallenge
          key={`login-${attemptKey}-${order.join(",")}`}
          images={orderedImages}
          busy={busy}
          onComplete={handleComplete}
          onCancel={() => {
            setStage("email");
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}
