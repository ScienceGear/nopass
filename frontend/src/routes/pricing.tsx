import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkle } from "lucide-react";
import { Button, FeatureCard, PillBadge, SectionHeading } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — NovaBank" },
      {
        name: "description",
        content: "No monthly fees, no minimums, no fine print. Bank for free with a passkey.",
      },
      { property: "og:title", content: "Pricing — NovaBank" },
      { property: "og:description", content: "Free forever. No password required." },
    ],
  }),
  component: Pricing,
});

const features = [
  {
    icon: <Sparkle />,
    title: "Everything is included",
    description:
      "Unlimited transfers, passkeys, devices and security alerts. No tiers, no upsells.",
  },
];

function Pricing() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge>Simple pricing</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[36rem] text-[2.1rem] leading-[1.05] sm:text-6xl">
              ₹0. Forever.
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[30rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              No monthly fees. No minimum balance. No fine print. The risk engine, the passkeys, the
              alerts — all included.
            </p>
          </Reveal>
        </section>

        <section className="pt-16 sm:pt-24">
          <div className="mx-auto max-w-md">
            <Reveal>
              <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-8 text-center shadow-card">
                <p className="tnum text-5xl font-bold">
                  ₹0<span className="text-lg font-semibold text-muted-foreground">/month</span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Every feature in the product, including passkey step-up and live session scoring.
                </p>
                <div className="mt-7">
                  <Button size="lg" className="w-full" asChild>
                    <Link to="/signup">
                      Open free account <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
                <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                  No card required · no password ever
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="pt-24 sm:pt-28">
          <Reveal>
            <SectionHeading
              eyebrow="Why it's free"
              title="Free is the point"
              sub="If a password is the only thing between you and your money, that security is free — so it should be the price."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
