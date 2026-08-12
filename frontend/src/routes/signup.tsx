import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Mail,
  MailCheck,
  MousePointerClick,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
} from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { PhoneInput } from "@/components/nova/PhoneInput";
import { Footer, Navbar, NovaBackground, AuthBackground } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  postPhoneOtpRequest,
  postRegisterInitiate,
  postVerifyDualOtp,
} from "@/lib/api";
import { saveSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<1 | 2>(1);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("+91");

  const [emailOtp, setEmailOtp] = React.useState("");
  const [phoneOtp, setPhoneOtp] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);

  const [resending, setResending] = React.useState(false);
  const [phoneBusy, setPhoneBusy] = React.useState(false);

  const phoneCodeSentRef = React.useRef(false);

  async function sendPhoneCode(channel: "sms" | "voice" = "sms") {
    setPhoneError(null);
    try {
      await postPhoneOtpRequest({ phone, purpose: "signup", email, channel });
      if (channel === "voice") {
        toast.success("Calling your phone…", {
          description: `Triggered voice call to ${phone} with your 6-digit code.`,
        });
      } else {
        toast.success("SMS code sent", { description: `We texted a 6-digit code to ${phone}.` });
      }
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Could not send the code.");
    }
  }

  async function resendEmailCode() {
    setResending(true);
    setError(null);
    try {
      await postRegisterInitiate({ name, email, phone });
      toast.success("Codes re-sent", { description: `Sent fresh codes to ${email} and ${phone}.` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-send verification codes.");
    } finally {
      setResending(false);
    }
  }

  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || !/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError("Enter your full name, a valid email, and phone number with country code.");
      return;
    }
    setError(null);
    setResending(true);
    try {
      const res = await postRegisterInitiate({ name, email, phone });
      if (res.devEmailOtp || res.devPhoneOtp) {
        toast.info("Dev Codes Surfaced", {
          description: `Email OTP: ${res.devEmailOtp || "Sent"} | Phone OTP: ${res.devPhoneOtp || "Sent"}`,
        });
      }
      setStep(2);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorCode(err.code || null);
      } else {
        setErrorCode(null);
      }
      setError(err instanceof Error ? err.message : "Could not start signup.");
    } finally {
      setResending(false);
    }
  }

  async function handleDualOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(emailOtp) || !/^\d{6}$/.test(phoneOtp)) {
      setError("Enter 6-digit verification codes for both Email and Mobile.");
      return;
    }
    setError(null);
    setPhoneBusy(true);
    try {
      const res = await postVerifyDualOtp({ email, emailOtp, phoneOtp });
      saveSession({
        accessToken: res.token,
        refreshToken: res.refreshToken,
        name: res.user.name,
        email: res.user.email,
        onboardingIncomplete: res.user.onboardingStep !== "complete",
      });
      toast.success("Identity verified!", { description: "Proceeding to secure account setup." });
      void navigate({ to: "/onboarding" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired verification codes.");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <NovaBackground>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <Navbar variant="marketing" />
      </div>

      <main className="flex min-h-[calc(100vh-140px)] items-center justify-center p-4 sm:p-6 lg:p-8">
        <AuthBackground>
          <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center overflow-y-auto px-4 py-8 sm:px-10">
            <div className="space-y-6 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-lime/30 bg-lime-soft px-3 py-1.5 text-xs font-semibold text-ink">
                <Sparkles className="size-3.5 text-lime" /> Passwordless Security
              </div>

              {step === 1 ? (
                <form onSubmit={startSignup} className="space-y-5 text-left">
                  <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Open your Nova account</h1>
                    <p className="text-sm text-muted-foreground">
                      No passwords to memorize. We will verify your email and phone via Dual OTP.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Alex Chen"
                        className="h-11 rounded-2xl"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email">Email address</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        className="h-11 rounded-2xl"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Mobile number</Label>
                      <PhoneInput value={phone} onChange={setPhone} />
                    </div>
                  </div>

                  {error ? (
                    <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                      <p>{error}</p>
                      {errorCode === "ONBOARDING_INCOMPLETE" ? (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" asChild>
                            <Link to="/login">Sign in to complete setup</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" disabled={resending}>
                    {resending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {resending ? "Sending verification codes…" : "Continue with Dual OTP"} <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleDualOtpVerify} className="space-y-6 text-left">
                  <div className="space-y-2 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-lime-soft text-ink">
                      <ShieldCheck className="size-6 text-lime" />
                    </span>
                    <h1 className="text-2xl font-bold">Verify Email &amp; Mobile OTP</h1>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      We sent 6-digit codes to <span className="font-medium text-ink">{email}</span> and{" "}
                      <span className="font-medium text-ink">{phone}</span>.
                    </p>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-hairline bg-card/60 p-4 sm:p-5">
                    {/* Email OTP Field */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="email-otp-input" className="flex items-center gap-1.5 text-xs font-semibold">
                          <Mail className="size-3.5 text-lime" /> Email 6-digit OTP
                        </Label>
                        <button
                          type="button"
                          onClick={resendEmailCode}
                          disabled={resending}
                          className="text-[0.6875rem] font-medium text-muted-foreground hover:text-ink"
                        >
                          {resending ? "Sending…" : "Resend Email Code"}
                        </button>
                      </div>
                      <Input
                        id="email-otp-input"
                        autoFocus
                        inputMode="numeric"
                        maxLength={6}
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••••"
                        className="tnum h-12 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                      />
                    </div>

                    <div className="hairline-y" />

                    {/* Phone OTP Field */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="phone-otp-input" className="flex items-center gap-1.5 text-xs font-semibold">
                          <Smartphone className="size-3.5 text-lime" /> Mobile 6-digit OTP
                        </Label>
                        <div className="flex gap-2 text-[0.6875rem]">
                          <button
                            type="button"
                            onClick={() => sendPhoneCode("sms")}
                            className="font-medium text-muted-foreground hover:text-ink"
                          >
                            Resend SMS
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => sendPhoneCode("voice")}
                            className="flex items-center gap-1 font-bold text-ink hover:underline"
                          >
                            <PhoneCall className="size-3 text-lime" /> Call me
                          </button>
                        </div>
                      </div>
                      <Input
                        id="phone-otp-input"
                        inputMode="numeric"
                        maxLength={6}
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••••"
                        className="tnum h-12 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                      />
                    </div>
                  </div>

                  {error ? (
                    <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <Button type="submit" size="lg" className="w-full" disabled={phoneBusy}>
                    {phoneBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Verify Both Codes &amp; Proceed <ArrowRight className="size-4" />
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError(null);
                    }}
                    className="w-full text-center text-xs font-medium text-muted-foreground hover:text-ink"
                  >
                    ← Change name or phone number
                  </button>
                </form>
              )}
            </div>
          </div>
        </AuthBackground>
      </main>

      <Footer />
    </NovaBackground>
  );
}
