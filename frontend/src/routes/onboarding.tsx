import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Check, Fingerprint, ImageIcon, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getOnboardingImagePool,
  getOnboardingStatus,
  postOnboardingImageSetup,
  postOnboardingPasskeyOptions,
  postOnboardingPasskeyVerify,
  postOnboardingPassword,
  type ImageSetupScene,
  type OnboardingStatus,
} from "@/lib/api";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const navigate = useNavigate();
  const { session, ready } = useSession();
  const [status, setStatus] = React.useState<OnboardingStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [pool, setPool] = React.useState<ImageSetupScene[]>([]);
  const [sceneKey, setSceneKey] = React.useState("");
  const [sequence, setSequence] = React.useState<{ imageKey: string; regionId: string }[]>([]);
  const keys = useKeystrokeCapture();

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

  async function setBackupPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Your backup password must be at least 10 characters long.");
      return;
    }
    if (password.length > 128) {
      setError("Your backup password must be 128 characters or fewer.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Your backup password must include at least one letter and one number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await postOnboardingPassword({ password, keystrokes: keys.getSamples() });
      if (result.breachWarning)
        toast.warning("This password appears in a known breach. Choose a new one later.");
      setPassword("");
      setConfirmPassword("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your backup password.");
    } finally {
      setBusy(false);
    }
  }

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

  async function finishImageSetup() {
    if (sequence.length < 2) {
      setError("Choose at least two objects in an order you will remember.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postOnboardingImageSetup(sequence);
      toast.success("Security setup complete", { description: "Welcome to NovaBank." });
      void navigate({ to: "/dashboard" });
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
      : status?.onboardingStep === "password_set"
        ? 2
        : 3;

  if (status?.onboardingStep === "complete") {
    void navigate({ to: "/dashboard" });
    return null;
  }

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <PillBadge>{status ? `Security setup · ${step} of 3` : "Loading setup"}</PillBadge>
        </header>
        <div className="flex justify-center py-10 sm:py-16">
          <Reveal className="w-full max-w-[34rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8">
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
                <form onSubmit={setBackupPassword} className="space-y-5">
                  <div className="space-y-2 text-center">
                    <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                      <LockKeyhole className="size-6" />
                    </span>
                    <h1 className="pt-2 text-2xl">Set a backup password</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Use this only when your passkey is unavailable. It is stored as an Argon2id
                      hash.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-password">Backup password</Label>
                    <Input
                      id="onboarding-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={keys.onKeyDown}
                      onPaste={keys.onPaste}
                      autoComplete="new-password"
                      className="h-12 rounded-2xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-confirm-password">Confirm password</Label>
                    <Input
                      id="onboarding-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className="h-12 rounded-2xl"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    At least 10 characters, including a letter and number.
                  </p>
                  <ErrorMessage error={error} />
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? "Saving…" : "Continue to passkey"}
                  </Button>
                </form>
              ) : status.onboardingStep === "password_set" ? (
                <div className="space-y-6 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                    <Fingerprint className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Create your passkey</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Use Windows Hello, Touch ID, Face ID, or your security key. Your biometric
                      data stays on your device.
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
                    <h1 className="pt-2 text-2xl">Create your account image sequence</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Choose 2–4 objects on one image in an order only you know. It is used for
                      additional account verification.
                    </p>
                  </div>
                  {recoveryCodes.length > 0 ? (
                    <div className="rounded-2xl bg-muted p-4">
                      <p className="mb-2 text-sm font-semibold">Save these recovery codes now</p>
                      <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                        {recoveryCodes.map((code) => (
                          <span key={code}>{code}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                  <p className="text-sm text-muted-foreground">
                    Selected: {sequence.length} / 4{" "}
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => setSequence([])}
                    >
                      Clear
                    </button>
                  </p>
                  <ErrorMessage error={error} />
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={busy || sequence.length < 2}
                    onClick={finishImageSetup}
                  >
                    {busy ? "Saving…" : "Finish secure setup"}
                    <Check className="size-4" />
                  </Button>
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

function ErrorMessage({ error }: { error: string | null }) {
  return error ? (
    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
  ) : null;
}
