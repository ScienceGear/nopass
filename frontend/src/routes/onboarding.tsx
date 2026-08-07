import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  Check,
  Fingerprint,
  ImageIcon,
  KeyRound,
  Loader2,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { AuthSplit, type AuthTip } from "@/components/nova/AuthSplit";
import { NovaBackground, Reveal } from "@/components/nova/shell";
import {
  getOnboardingImagePool,
  getOnboardingStatus,
  postOnboardingImageSetup,
  postOnboardingPasskeyOptions,
  postOnboardingPasskeyVerify,
  type ImageSetupScene,
  type OnboardingStatus,
} from "@/lib/api";
import { downloadRecoveryCodesPdf } from "@/lib/recoveryPdf";
import { setOnboardingIncomplete, useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const onboardingTips: AuthTip[] = [
  {
    icon: <Fingerprint className="size-4" />,
    title: "Face-first security",
    body: "Set up a passkey — your biometrics never leave your device.",
  },
  {
    icon: <ImageIcon className="size-4" />,
    title: "Images, not questions",
    body: "Pick objects only you know for extra verification on unusual logins.",
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
  const [pool, setPool] = React.useState<ImageSetupScene[]>([]);
  const [sceneKey, setSceneKey] = React.useState("");
  const [sequence, setSequence] = React.useState<{ imageKey: string; regionId: string }[]>([]);
  const [savedCodes, setSavedCodes] = React.useState(false);
  const [consent, setConsent] = React.useState(false);

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

  // Once onboarding is complete, drop the incomplete flag so RequireAuth and
  // the login redirects treat this account as fully set up.
  React.useEffect(() => {
    if (status?.onboardingStep === "complete") setOnboardingIncomplete(false);
  }, [status?.onboardingStep]);

  React.useEffect(() => {
    if (status?.onboardingStep !== "passkey_set") return;
    let cancelled = false;
    void getOnboardingImagePool()
      .then(({ pool: nextPool }) => {
        if (!cancelled) {
          setPool(nextPool);
          setSceneKey((current) => current || nextPool[0]?.key || "");
        }
      })
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof Error ? err.message : "Could not load image setup."),
      );
    return () => {
      cancelled = true;
    };
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

  function selectRegion(regionId: string) {
    if (!sceneKey || sequence.length === 4) return;
    const key = `${sceneKey}:${regionId}`;
    if (sequence.some((item) => `${item.imageKey}:${item.regionId}` === key)) return;
    setSequence((current) => [...current, { imageKey: sceneKey, regionId }]);
  }

  async function finishSetup() {
    if (!savedCodes || !consent) {
      setError("Confirm you saved your codes and agree to the consent to finish.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postOnboardingImageSetup(sequence);
      toast.success("Setup complete", { description: "Welcome to NovaBank." });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your image sequence.");
    } finally {
      setBusy(false);
    }
  }

  const scene = pool.find((item) => item.key === sceneKey);
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
          badge={<PillBadge>Ready · 3 of 3</PillBadge>}
          tips={onboardingTips}
        >
          <Reveal className="w-full max-w-[30rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-6 text-center shadow-card sm:p-8">
              <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                <PartyPopper className="size-7" />
              </span>
              <h1 className="pt-4 text-2xl">Welcome, {status.name.split(" ")[0]}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Your account is live. We&apos;ve credited a demo balance so you can explore — park
                it, spend it, or just admire how fast passkey sign-in is.
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
        subline="Set a passkey, save your recovery codes, and finish in under a minute."
        badge={<PillBadge>{status ? `Security setup · ${step} of 3` : "Loading setup"}</PillBadge>}
        tips={onboardingTips}
      >
        <Reveal className="w-full max-w-[30rem]">
          <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-6 shadow-card sm:p-8">
            <div className="mb-7 flex gap-1.5">
              {[1, 2, 3].map((value) => (
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
                  <Fingerprint className="size-7" />
                </span>
                <div className="space-y-2">
                  <h1 className="text-2xl">Create your passkey</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Use Windows Hello, Touch ID, Face ID, or your security key. Your biometric data
                    stays on your device. No password is ever needed.
                  </p>
                </div>
                <ErrorMessage error={error} />
                <Button size="lg" className="w-full" disabled={busy} onClick={createPasskey}>
                  {busy ? "Waiting for your device…" : "Set up biometric passkey"}
                  <KeyRound className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                    <ImageIcon className="size-7" />
                  </span>
                  <h1 className="pt-2 text-2xl">Backup &amp; consent</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Save your recovery codes, optionally add an account image, then confirm your
                    consent to finish.
                  </p>
                </div>

                {recoveryCodes.length > 0 ? (
                  <div className="rounded-2xl bg-muted p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">Your recovery codes</p>
                      <button
                        type="button"
                        className="text-xs underline-offset-4 hover:underline"
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
                  <div className="flex min-h-24 animate-pulse items-center justify-center rounded-2xl bg-muted" />
                )}

                <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={savedCodes}
                    onChange={(e) => setSavedCodes(e.target.checked)}
                  />
                  <span>
                    I have saved these 10 recovery codes somewhere offline. NovaBank does not store
                    them in plaintext — this is the only way to get back into my account if I lose
                    every device.
                  </span>
                </label>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Optional: your account image</p>
                  <p className="text-xs text-muted-foreground">
                    Choose 2–4 objects on one image in an order only you know. Used for extra
                    verification on unusual sign-ins.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pool.map((item) => (
                    <Button
                      key={item.key}
                      size="sm"
                      variant={item.key === sceneKey ? "primary" : "outline"}
                      onClick={() => {
                        setSceneKey(item.key);
                        setSequence([]);
                      }}
                    >
                      {item.name}
                    </Button>
                  ))}
                </div>
                {scene ? (
                  <div
                    className="relative overflow-hidden rounded-2xl border bg-muted"
                    style={{ aspectRatio: "320 / 200" }}
                  >
                    <div className="size-full" dangerouslySetInnerHTML={{ __html: scene.svg }} />
                    {scene.regions.map((region) => {
                      const selected = sequence.findIndex(
                        (item) => item.imageKey === scene.key && item.regionId === region.id,
                      );
                      const [x, y, width, height] = region.box;
                      return (
                        <button
                          key={region.id}
                          type="button"
                          aria-label={`Choose object ${region.id}`}
                          onClick={() => selectRegion(region.id)}
                          className={`absolute rounded-md border-2 transition-colors ${selected >= 0 ? "border-lime bg-lime/20" : "border-transparent hover:border-white/70"}`}
                          style={{
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            width: `${width * 100}%`,
                            height: `${height * 100}%`,
                          }}
                        >
                          {selected >= 0 ? (
                            <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-lime text-xs font-bold">
                              {selected + 1}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-48 animate-pulse rounded-2xl bg-muted" />
                )}

                <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-lime"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I understand NovaBank collects device, behaviour and geolocation data to protect
                    my account. Read the{" "}
                    <Link
                      to="/security"
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      security promise
                    </Link>{" "}
                    before continuing.
                  </span>
                </label>

                <ErrorMessage error={error} />
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy || !savedCodes || !consent}
                  onClick={finishSetup}
                >
                  {busy ? "Saving…" : "Finish secure setup"} <Check className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </Reveal>
      </AuthSplit>
    </NovaBackground>
  );
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? (
    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
  ) : null;
}
