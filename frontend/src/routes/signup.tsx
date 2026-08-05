import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, ChevronDown, Mail, ShieldCheck, User } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postRegisterOptions, postRegisterVerify } from "@/lib/api";
import { saveSession } from "@/lib/session";
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

function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState("Rohan Patil");
  const [email, setEmail] = React.useState("rohan.patil@hey.com");
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [why, setWhy] = React.useState(false);

  async function goToPasskey(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@")) {
      setError("Enter your full name and a valid email.");
      return;
    }
    setError(null);
    await postRegisterOptions({ name, email });
    setStep(2);
  }

  async function createPasskey() {
    setPhase("waiting");
    setError(null);
    try {
      await postRegisterVerify({ credentialId: "cred_demo" });
      setPhase("success");
      saveSession({ token: "demo", name });
      toast.success("Passkey created", {
        description: `${name.split(" ")[0]}, your account is live.`,
      });
      setTimeout(() => navigate({ to: "/dashboard" }), 1100);
    } catch {
      setPhase("error");
      setError("Your device cancelled the request. Try again.");
    }
  }

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <span className="eyebrow">Step {step} of 2</span>
        </header>

        <div className="flex flex-col items-center justify-center py-10 sm:py-16">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8">
              {/* progress hairline */}
              <div className="mb-7 flex gap-1.5">
                {[1, 2].map((s) => (
                  <span
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      step >= s ? "bg-lime" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              {step === 1 ? (
                <form onSubmit={goToPasskey} className="space-y-5">
                  <div className="space-y-2">
                    <PillBadge icon={<ShieldCheck />}>No password required</PillBadge>
                    <h1 className="pt-2 text-2xl">Open your account</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      We only need a name and an email. Everything else is handled by your device.
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

                  <Button type="submit" size="lg" className="w-full">
                    Continue <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : (
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

                  {phase === "success" ? (
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[oklch(0.52_0.14_152)]">
                      Verified · taking you to your account
                    </p>
                  ) : (
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
                  )}

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
