import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { Footer, Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postEmailLoginRequest, postEmailLoginVerify, postRecoveryLogin } from "@/lib/api";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { toast } from "sonner";

export const Route = createFileRoute("/recover")({
  head: () => ({
    meta: [
      { title: "Recover your account — NovaBank" },
      {
        name: "description",
        content: "Get back into your NovaBank account without a password.",
      },
    ],
  }),
  component: Recover,
});

function Recover() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [devOtp, setDevOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const keys = useKeystrokeCapture();

  async function requestEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email on your account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postEmailLoginRequest({ email, keystrokes: keys.getSamples() });
      setDevOtp(res.devOtp ?? "");
      setSent(true);
      toast.success("Code sent", { description: `A sign-in code is on its way to ${email}.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const finalOtp = otp || devOtp;
      await postEmailLoginVerify({ email, otp: finalOtp, keystrokes: keys.getSamples() });
      toast.success("Welcome back");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setBusy(false);
    }
  }

  async function redeemCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Enter the email on your account.");
      return;
    }
    if (code.trim().length < 4) {
      setError("Enter a recovery code — format XXXX-XXXX.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postRecoveryLogin({ email, code, keystrokes: keys.getSamples() });
      toast.success("Recovered", { description: "You're signed in with a fresh session." });
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That recovery code was invalid or already used.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between py-4">
          <Logo />
          <PillBadge icon={<ShieldCheck />}>No password, ever</PillBadge>
        </header>

        <div className="flex flex-col items-center justify-center py-12 sm:py-20">
          <Reveal className="w-full max-w-[27rem]">
            <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8">
              <div className="space-y-2 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime-soft">
                  <KeyRound className="size-6" />
                </span>
                <h1 className="pt-2 text-2xl">Recover your account</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Lost your devices? Use the email we have, or a recovery code you saved. There is
                  no password to reset — that&apos;s by design.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
                {(
                  [
                    ["email", "Email me a code"],
                    ["code", "Recovery code"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      mode === m ? "bg-card text-ink shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "email" ? (
                sent ? (
                  <form onSubmit={confirmEmail} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="recover-otp">Email code</Label>
                      <Input
                        id="recover-otp"
                        autoFocus
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={keys.onKeyDown}
                        placeholder="••••••"
                        className="tnum h-14 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                      />
                    </div>
                    {devOtp ? (
                      <p className="text-center text-xs text-muted-foreground">
                        Dev preview — your code is{" "}
                        <span className="font-mono font-semibold text-ink">{devOtp}</span>
                      </p>
                    ) : null}
                    {error ? (
                      <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <Button type="submit" size="lg" className="w-full" disabled={busy}>
                      {busy ? "Checking…" : "Confirm and sign in"} <ArrowRight className="size-4" />
                    </Button>
                    <button
                      type="button"
                      className="w-full text-center text-sm font-medium text-muted-foreground hover:text-ink"
                      onClick={() => setSent(false)}
                    >
                      ← Use a different email
                    </button>
                  </form>
                ) : (
                  <form onSubmit={requestEmail} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="recover-email">Email</Label>
                      <Input
                        id="recover-email"
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={keys.onKeyDown}
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
                      {busy ? "Sending…" : "Email me a code"} <Mail className="size-4" />
                    </Button>
                  </form>
                )
              ) : (
                <form onSubmit={redeemCode} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recover-code-email">Email</Label>
                    <Input
                      id="recover-code-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="h-12 rounded-2xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recover-code">Recovery code</Label>
                    <Input
                      id="recover-code"
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      onKeyDown={keys.onKeyDown}
                      placeholder="XXXX-XXXX"
                      className="h-12 rounded-2xl text-center font-mono text-lg tracking-[0.12em]"
                    />
                  </div>
                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? "Verifying…" : "Redeem code"}
                  </Button>
                </form>
              )}
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Remember your passkey?{" "}
              <Link
                to="/login"
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </Reveal>
        </div>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
