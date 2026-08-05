import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Fingerprint,
  Gauge,
  Leaf,
  Lock,
  MonitorSmartphone,
  Radar,
  ScanFace,
  Sparkle,
  Waves,
} from "lucide-react";
import { BankCard } from "@/components/nova/BankCard";
import {
  Button,
  FeatureCard,
  PillBadge,
  SectionHeading,
  StatCard,
} from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NovaBank — Banking that can't be phished" },
      {
        name: "description",
        content:
          "Open a NovaBank account in two minutes. No password to steal, no OTP to intercept — just your face, your device, and a risk engine that never sleeps.",
      },
      { property: "og:title", content: "NovaBank — Banking that can't be phished" },
      {
        property: "og:description",
        content:
          "Passwordless banking with passkeys, device intelligence and adaptive risk scoring.",
      },
    ],
  }),
  component: Home,
});

const steps = [
  {
    icon: <ScanFace />,
    title: "Register with Face ID",
    description: "One scan creates a passkey on your device. Nothing to remember, nothing to type.",
  },
  {
    icon: <MonitorSmartphone />,
    title: "Bank from any device",
    description: "New laptop? Scan a QR with your phone and approve. Sign-in takes four seconds.",
  },
  {
    icon: <Radar />,
    title: "We watch for anything unusual",
    description: "Every session is scored live. Odd signals get a check, hostile ones get stopped.",
  },
];

const pillars = [
  {
    icon: <Fingerprint />,
    title: "Passkeys",
    description:
      "Your key is sealed in your device's secure chip. There is no password in our database to leak.",
  },
  {
    icon: <MonitorSmartphone />,
    title: "Device intelligence",
    description:
      "We recognise the hardware you bank on. An unknown device never gets a quiet pass.",
  },
  {
    icon: <Waves />,
    title: "Behavioural verification",
    description:
      "Rhythm, timing and location build a picture of you. Impostors break the pattern fast.",
  },
  {
    icon: <Gauge />,
    title: "Adaptive risk engine",
    description:
      "Low risk sails through. Medium asks one question. High is blocked before money moves.",
  },
];

const trust = [
  { icon: <BadgeCheck />, label: "FIDO2 certified" },
  { icon: <Lock />, label: "256-bit encryption" },
  { icon: <Fingerprint />, label: "Zero password breaches" },
  { icon: <Radar />, label: "Risk scored in 40ms" },
];

function Home() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="relative pb-4 pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<Leaf />}>Bank without a password</PillBadge>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[52rem] text-[2.1rem] leading-[1.05] sm:text-6xl lg:text-[4.1rem]">
              Banking That Can&apos;t
              <br className="hidden sm:block" /> Be Phished
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[34rem] text-[0.95rem] leading-relaxed text-muted-foreground sm:text-base">
              NovaBank replaces passwords with passkeys sealed inside your device, then scores every
              sign-in and transfer on how it actually behaves — not on what someone typed.
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/signup">
                  <Sparkle className="size-[1.05rem]" /> Open free account
                </Link>
              </Button>
              <Button variant="ghost" size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/security">
                  See how it works <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={260} className="mt-14 sm:mt-20">
            <BankCard />
          </Reveal>
        </section>

        {/* ── How it works ───────────────────────────────────────── */}
        <section className="pt-24 sm:pt-32">
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="Three steps, then you never think about it again"
              sub="Set-up is the only moment security asks anything of you."
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <FeatureCard {...s} index={`0${i + 1}`} className="h-full" />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Security explained ─────────────────────────────────── */}
        <section className="pt-24 sm:pt-32">
          <Reveal>
            <SectionHeading
              eyebrow="Security, explained simply"
              title="Four layers. No jargon."
              sub="Each one works on its own. Together they make a stolen credential worthless."
            />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <FeatureCard {...p} className="h-full" />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Trust strip ────────────────────────────────────────── */}
        <Reveal className="mt-12 flex flex-wrap items-center justify-center gap-2 border-y border-[oklch(0.207_0.014_251_/_0.07)] py-6">
          {trust.map((t) => (
            <PillBadge key={t.label} tone="white" icon={t.icon}>
              {t.label}
            </PillBadge>
          ))}
        </Reveal>

        {/* ── Stat callout ───────────────────────────────────────── */}
        <Reveal className="mt-16">
          <div className="grid gap-8 rounded-[2rem] bg-lime-soft p-8 sm:grid-cols-3 sm:p-12">
            <StatCard
              value="4×"
              label="Faster sign-in than passwords"
              footnote="Median 3.8s, measured across 12k demo sessions"
            />
            <StatCard
              value="0"
              label="Passwords stored"
              footnote="There is nothing in our database to steal"
            />
            <StatCard
              value="92%"
              label="Of blocked attempts flagged pre-auth"
              footnote="Caught by device + behaviour signals"
            />
          </div>
        </Reveal>

        {/* ── Final CTA ──────────────────────────────────────────── */}
        <Reveal className="mt-20">
          <div className="relative overflow-hidden rounded-[2rem] border border-[oklch(0.207_0.014_251_/_0.07)] px-6 py-14 text-center shadow-card sm:px-12">
            <div
              aria-hidden="true"
              className="nova-silk absolute -bottom-24 left-1/2 h-52 w-[42rem] -translate-x-1/2 rounded-[50%] opacity-45"
            />
            <div className="relative">
              <p className="eyebrow">Two minutes, no paperwork</p>
              <h2 className="mx-auto mt-3 max-w-[26rem] text-[1.75rem] leading-[1.1] sm:text-4xl">
                Open an account your attacker can&apos;t log into
              </h2>
              <Button size="lg" className="mt-7" asChild>
                <Link to="/signup">
                  <Sparkle className="size-[1.05rem]" /> Open free account
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
