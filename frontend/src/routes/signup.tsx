import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowRight,
  ClipboardCheck,
  Fingerprint,
  Loader2,
  Mail,
  MailCheck,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
} from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { PhoneInput } from "@/components/nova/PhoneInput";
import { AuthSplit, type AuthTip } from "@/components/nova/AuthSplit";
import { Footer, Navbar, NovaBackground, AuthBackground, Reveal } from "@/components/nova/shell";
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

const signupTips: AuthTip[] = [
  {
    icon: <Fingerprint className="size-4 text-lime" />,
    title: "Password-Free Authentication",
    body: "Create and log in to your account without passwords. Authenticate securely with biometrics.",
  },
  {
    icon: <Smartphone className="size-4 text-lime" />,
    title: "Dual-Factor Verification",
    body: "Secured by concurrent Email and Mobile SMS OTP verification for complete signup integrity.",
  },
  {
    icon: <ShieldCheck className="size-4 text-lime" />,
    title: "Anti-Phishing Standard",
    body: "Built on WebAuthn standards, preventing lookup key interception or spoofing attacks.",
  },
];

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
    <AuthBackground>
      <AuthSplit
        eyebrow="Onboarding"
        headline="Create your password-free account."
        subline="Set up biometrics and secure your banking dashboard in seconds."
        badge={
          <PillBadge tone="white" icon={<Sparkles className="size-3.5" />}>
            NovaBank Enrollment
          </PillBadge>
        }
        tips={signupTips}
      >
        <Reveal className="w-full max-w-[26rem]">
          <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card px-5 py-5 text-center shadow-card sm:px-6 sm:py-6">
            {step === 1 ? (
              <form onSubmit={startSignup} className="space-y-5 text-left">
                <div className="space-y-2 text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                    <User className="size-7 text-lime" />
                  </span>
                  <h1 className="text-2xl font-bold tracking-tight">Open your account</h1>
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
                    <Label htmlFor="signup-phone">Mobile number</Label>
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      placeholder="98765 43210"
                    />
                  </div>
                </div>

                {error ? (
                  <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={resending}>
                  {resending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Continue <ArrowRight className="size-4" />
                </Button>

                <div className="border-t border-hairline pt-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <Link to="/login" className="font-semibold text-lime hover:underline">
                      Sign in here
                    </Link>
                  </p>
                </div>
              </form>
            ) : (
              <form onSubmit={handleDualOtpVerify} className="space-y-5 text-left">
                <div className="space-y-2 text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                    <ClipboardCheck className="size-7 text-lime" />
                  </span>
                  <h1 className="text-2xl font-bold tracking-tight">Verify both codes</h1>
                  <p className="text-sm text-muted-foreground">
                    We sent two separate 6-digit verification codes to verify your identity.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <Label htmlFor="email-otp-input">Email Verification Code</Label>
                      <button
                        type="button"
                        onClick={resendEmailCode}
                        className="text-lime hover:underline"
                        disabled={resending}
                      >
                        Resend Code
                      </button>
                    </div>
                    <Input
                      id="email-otp-input"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••••"
                      className="tnum h-12 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <Label htmlFor="phone-otp-input">Mobile Verification Code</Label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => sendPhoneCode("sms")}
                          className="text-lime hover:underline"
                        >
                          Resend SMS
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => sendPhoneCode("voice")}
                          className="flex items-center gap-1 font-semibold text-lime hover:underline"
                        >
                          <PhoneCall className="size-3" /> Call me
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
        </Reveal>
      </AuthSplit>
    </AuthBackground>
  );
}
