import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  Check,
  Fingerprint,
  KeyRound,
  Loader2,
  MousePointerClick,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { AuthSplit, type AuthTip } from "@/components/nova/AuthSplit";
import { NovaBackground, Reveal } from "@/components/nova/shell";
import {
  getOnboardingStatus,
  postOnboardingPasskeyOptions,
  postOnboardingPasskeyVerify,
  type OnboardingStatus,
} from "@/lib/api";
import { downloadRecoveryCodesPdf } from "@/lib/recoveryPdf";
import { setOnboardingIncomplete, useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const onboardingTips: AuthTip[] = [
  {
    icon: <Fingerprint className="size-4" />,
    title: "Face & Touch Security",
    body: "Set up your passkey — your biometrics never leave your device.",
  },
  {
    icon: <MousePointerClick className="size-4" />,
    title: "Click-Point Pattern (PCCP)",
    body: "Choose memorable spots on images as your primary passwordless login fallback.",
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "No passwords, ever",
    body: "There's no password vault on NovaBank for attackers to steal.",
  },
];

function Onboarding() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [status, setStatus] = React.useState<OnboardingStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [savedCodes, setSavedCodes] = React.useState(false);

  const loadStatus = React.useCallback(async () => {
    try {
      setStatus(await getOnboardingStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume onboarding.");
    }
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    if (!session) {
      void navigate({ to: "/signup" });
      return;
    }
    void loadStatus();
  }, [ready, session, navigate, loadStatus]);

  React.useEffect(() => {
    if (status?.onboardingStep === "complete") setOnboardingIncomplete(false);
  }, [status?.onboardingStep]);

  async function createPasskey() {
    if (!browserSupportsWebAuthn()) {
      setError("This browser does not support passkeys. Try Chrome, Edge, or Safari.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const options = await postOnboardingPasskeyOptions();
      const credential = await startRegistration({ optionsJSON: options });
      const result = await postOnboardingPasskeyVerify({ credential });
      setRecoveryCodes(result.recoveryCodes);
      toast.success("Passkey created", {
        description: "Your device can now verify your identity.",
      });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey setup was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  }

  const step =
    status?.onboardingStep === "email_pending"
      ? 1
      : status?.onboardingStep === "passkey_set"
        ? 2
        : 3;

  if (status?.onboardingStep === "complete") {
    return (
      <NovaBackground>
        <AuthSplit
          eyebrow="Setup complete"
          headline="Welcome to NovaBank"
          subline="Your account is live, fully password-free, and ready to explore."
          badge={<PillBadge>Ready · 2 of 2</PillBadge>}
          tips={onboardingTips}
        >
          <Reveal className="w-full max-w-[30rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-6 text-center shadow-card sm:p-8">
              <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                <PartyPopper className="size-7 text-lime" />
              </span>
              <h1 className="pt-4 text-2xl font-bold">Welcome, {status.name.split(" ")[0]}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Your account is live. We&apos;ve credited a demo balance so you can explore.
              </p>
              <div className="mx-auto mt-5 max-w-xs rounded-2xl bg-muted p-4">
                <p className="eyebrow">Demo balance</p>
                <p className="pt-1 text-3xl font-semibold tracking-tight">₹5,00,000.00</p>
              </div>
              <Button
                size="lg"
                className="mt-6 w-full"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                Go to my dashboard <Check className="size-4" />
              </Button>
            </div>
          </Reveal>
        </AuthSplit>
      </NovaBackground>
    );
  }

  return (
    <NovaBackground>
      <AuthSplit
        eyebrow="Security setup"
        headline="A few taps to lock it down"
        subline="Set a passkey, save your recovery codes, and enroll PCCP click-points."
        badge={<PillBadge>{status ? `Security setup · ${step} of 2` : "Loading setup"}</PillBadge>}
        tips={onboardingTips}
      >
        <Reveal className="w-full max-w-[30rem]">
          <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-6 shadow-card sm:p-8">
            <div className="mb-7 flex gap-1.5">
              {[1, 2].map((value) => (
                <span
                  key={value}
                  className={`h-1 flex-1 rounded-full ${value <= step ? "bg-lime" : "bg-muted"}`}
                />
              ))}
            </div>
            {!status ? (
              <div className="flex min-h-44 items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" /> Loading your secure setup…
              </div>
            ) : status.onboardingStep === "email_pending" ? (
              <div className="space-y-6 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                  <Fingerprint className="size-7 text-lime" />
                </span>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold">Create your passkey</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Use Windows Hello, Touch ID, Face ID, or your security key. Your biometric data
                    stays on your device.
                  </p>
                </div>
                {error ? (
                  <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button size="lg" className="w-full" disabled={busy} onClick={createPasskey}>
                  {busy ? "Waiting for your device…" : "Set up biometric passkey"}
                  <KeyRound className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                    <MousePointerClick className="size-7 text-lime" />
                  </span>
                  <h1 className="pt-2 text-2xl font-bold">Backup &amp; PCCP Enrollment</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Save your recovery codes, then set up your click-point pattern (PCCP).
                  </p>
                </div>

                {recoveryCodes.length > 0 ? (
                  <div className="rounded-2xl bg-muted p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">Your 10 Recovery Codes</p>
                      <button
                        type="button"
                        className="text-xs font-semibold text-lime underline-offset-4 hover:underline"
                        onClick={() => downloadRecoveryCodesPdf(recoveryCodes, status.email)}
                      >
                        Download PDF
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                      {recoveryCodes.map((code) => (
                        <span key={code}>{code}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-16 items-center justify-center rounded-2xl bg-muted text-xs text-muted-foreground">
                    Recovery codes saved to your account.
                  </div>
                )}

                <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={savedCodes}
                    onChange={(e) => setSavedCodes(e.target.checked)}
                  />
                  <span>
                    I have saved these recovery codes offline. I understand they are required if I ever lose my device.
                  </span>
                </label>

                <Button
                  size="lg"
                  className="w-full"
                  disabled={!savedCodes}
                  onClick={() => navigate({ to: "/pccp/setup" })}
                >
                  Set Up Click-Point Pattern (PCCP) <MousePointerClick className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </Reveal>
      </AuthSplit>
    </NovaBackground>
  );
}
