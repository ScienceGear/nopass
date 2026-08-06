import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  postRegisterInitiate,
  postRegisterOptions,
  postRegisterStatus,
  postRegisterVerify,
} from "@/lib/api";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { downloadRecoveryCodesPdf } from "@/lib/recoveryPdf";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Open a NovaBank account — no password needed" },
      {
        name: "description",
        content:
          "Two fields and one Face ID scan. Your passkey is created on your device, never on our servers.",
      },
      { property: "og:title", content: "Open a NovaBank account" },
      {
        property: "og:description",
        content: "Two fields and one Face ID scan. No password, ever.",
      },
    ],
  }),
  component: Signup,
});

type Step = 1 | 2 | 3 | 4;

function Signup() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [step, setStep] = React.useState<Step>(1);
  const [name, setName] = React.useState("Rohan Patil");
  const [email, setEmail] = React.useState("rohan.patil@hey.com");
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [why, setWhy] = React.useState(false);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [resending, setResending] = React.useState(false);
  const keys = useKeystrokeCapture();

  React.useEffect(() => {
    if (session && step !== 4) navigate({ to: "/dashboard" });
  }, [session, navigate, step]);

  // Poll verification status while on the "check your inbox" step.
  React.useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    const check = async () => {
      try {
        const status = await postRegisterStatus(email);
        if (!cancelled && status.verified) {
          toast.success("Email verified", {
            description: "Continue with your secure account setup.",
          });
          void navigate({ to: "/onboarding" });
        }
      } catch {
        /* transient — keep polling */
      }
    };
    const timer = setInterval(check, 3000);
    check();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, email, navigate]);

  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@")) {
      setError("Enter your full name and a valid email.");
      return;
    }
    setError(null);
    setResending(true);
    try {
      await postRegisterInitiate({ name, email });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start signup.");
    } finally {
      setResending(false);
    }
  }

  async function resendEmail() {
    setError(null);
    setResending(true);
    try {
      await postRegisterInitiate({ name, email });
      toast.success("Email sent", { description: `A fresh link is on its way to ${email}.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email.");
    } finally {
      setResending(false);
    }
  }

  async function createPasskey() {
    setPhase("waiting");
    setError(null);
    try {
      if (!browserSupportsWebAuthn()) {
        setError("This browser doesn't support passkeys yet. Try Chrome, Edge or Safari.");
        setPhase("idle");
        return;
      }
      const options = await postRegisterOptions({ name, email });
      keys.getSamples();
      const credential = await startRegistration({ optionsJSON: options });
      const res = await postRegisterVerify({ name, email, credential });
      setPhase("success");
      setRecoveryCodes(res.recoveryCodes);
      setStep(4);
      toast.success("Passkey created", {
        description: `${name.split(" ")[0]}, your account is live.`,
      });
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error ? err.message : "Your device cancelled the request. Try again.",
      );
    }
  }

  const progressTotal = step === 4 ? 4 : 3;

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <span className="eyebrow">
            Step {Math.min(step, 3)} of {progressTotal === 4 ? "4" : "3"}
          </span>
        </header>

        <div className="flex flex-col items-center justify-center py-10 sm:py-16">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8">
              {/* progress hairline */}
              <div className="mb-7 flex gap-1.5">
                {[1, 2, 3, 4].map((s) => (
                  <span
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      step >= s ? "bg-lime" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              {step === 1 ? (
                <form onSubmit={startSignup} className="space-y-5">
                  <div className="space-y-2">
                    <PillBadge icon={<ShieldCheck />}>No password required</PillBadge>
                    <h1 className="pt-2 text-2xl">Open your account</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      We only need a name and an email. We&apos;ll email you a link to prove the
                      address is yours, then we guide you through backup access, a passkey, and an
                      account image sequence.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name</Label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="h-12 rounded-2xl pl-10"
                          placeholder="Rohan Patil"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onKeyDown={keys.onKeyDown}
                          className="h-12 rounded-2xl pl-10"
                          placeholder="you@email.com"
                        />
                      </div>
                    </div>
                  </div>

                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" disabled={resending}>
                    {resending ? "Sending…" : "Continue"} <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : step === 2 ? (
                <div className="space-y-6 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/14 text-[oklch(0.58_0.13_70)]">
                    <MailCheck className="size-7" />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Check your inbox</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      We sent a verification link to{" "}
                      <span className="font-medium text-ink">{email}</span>. It expires in 15
                      minutes. Click it, then come back here — we&apos;ll carry on automatically.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Waiting for you to verify…
                  </div>

                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full"
                    disabled={resending}
                    onClick={resendEmail}
                  >
                    {resending ? "Sending…" : "Re-send the email"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError(null);
                    }}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                  >
                    ← Use a different email
                  </button>
                </div>
              ) : step === 3 ? (
                <div className="space-y-6 text-center">
                  <div className="flex justify-center">
                    <PasskeyGlyph phase={phase} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Create your passkey</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Your device generates a key pair and keeps the private half in its secure
                      chip. We only ever see the public half.
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
                    disabled={phase === "waiting"}
                    onClick={createPasskey}
                  >
                    {phase === "waiting"
                      ? "Waiting for your device…"
                      : "Continue with Face ID / Touch ID"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep(2);
                      setError(null);
                      setPhase("idle");
                    }}
                    className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                  >
                    ← Back
                  </button>

                  {/* Why no password — expandable */}
                  <button
                    type="button"
                    onClick={() => setWhy((v) => !v)}
                    className="flex w-full items-center justify-between border-t border-[oklch(0.207_0.014_251_/_0.07)] pt-4 text-left text-sm font-medium"
                  >
                    Why no password?
                    <ChevronDown
                      className={`size-4 transition-transform duration-200 ${why ? "rotate-180" : ""}`}
                    />
                  </button>
                  {why ? (
                    <p className="text-left text-sm leading-relaxed text-muted-foreground">
                      Passwords get reused, guessed and phished. A passkey can&apos;t be typed into
                      a fake site — it only works on the real NovaBank domain, and it never leaves
                      your device.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-5 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success/14 text-[oklch(0.52_0.14_152)]">
                    <Check className="size-7" strokeWidth={2.4} />
                  </span>
                  <div className="space-y-2">
                    <h1 className="text-2xl">Account created</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Save these 10 recovery codes somewhere offline. They&apos;re the only way back
                      in if you ever lose every device. We don&apos;t store them — this is the only
                      time you&apos;ll see them.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-4 text-left font-mono text-sm tracking-[0.08em]">
                    {recoveryCodes.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadRecoveryCodesPdf(recoveryCodes, email)}
                  >
                    Download as PDF
                  </Button>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => navigate({ to: "/dashboard" })}
                  >
                    I&apos;ve saved these — go to my account <ArrowRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already with us?{" "}
              <Link
                to="/login"
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                Sign in with a passkey
              </Link>
            </p>
          </Reveal>
        </div>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
