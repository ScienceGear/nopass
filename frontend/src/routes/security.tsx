import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Fingerprint, Radar, Waves } from "lucide-react";
import { Button, FeatureCard, PillBadge, SectionHeading } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "How passkey security works  NovaBank" },
      {
        name: "description",
        content:
          "Passkeys sealed in your device, device intelligence and a risk engine that scores every session in real time.",
      },
      { property: "og:title", content: "How NovaBank security works" },
      {
        property: "og:description",
        content: "No password to steal, no OTP to intercept.",
      },
    ],
  }),
  component: Security,
});

const layers = [
  {
    icon: <Fingerprint />,
    title: "Passkeys, not passwords",
    description:
      "Your private key never leaves the secure chip on your device. There is no password in our database  nothing to leak, nothing to phish.",
  },
  {
    icon: <Waves />,
    title: "Behavioural signals",
    description:
      "Every sign-in is measured: how you type, which device you use, where you are, how often sessions appear. Impostors break the pattern fast.",
  },
  {
    icon: <Radar />,
    title: "Adaptive risk scoring",
    description:
      "A live score decides the path. Known device at the usual hour sails through. Something odd triggers one more proof. Hostile signals stop it.",
  },
];

function Security() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<Fingerprint />}>FIDO2 passkeys</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[42rem] text-[2.1rem] leading-[1.05] sm:text-6xl">
              No Password to Steal.
              <br /> No OTP to Intercept.
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[32rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Security at NovaBank isn&apos;t a secret you type. It&apos;s a key in your device,
              backed by a risk engine that never sleeps.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 flex justify-center">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Try it for free <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </section>

        <section className="pt-24 sm:pt-32">
          <Reveal>
            <SectionHeading
              eyebrow="Three layers"
              title="How a sign-in stays safe"
              sub="Each layer makes the next one stronger. Together they make phishing pointless."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {layers.map((l, i) => (
              <Reveal key={l.title} delay={i * 100}>
                <FeatureCard {...l} />
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pt-24 sm:pt-28">
          <Reveal>
            <SectionHeading
              eyebrow="Read the receipts"
              title="Every session is logged"
              sub="Every sign-in, transfer and blocked attempt is scored and shown in your Activity page."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Reveal delay={60}>
              <div className="rounded-3xl bg-muted p-6">
                <p className="tnum text-4xl font-bold">&lt;40ms</p>
                <p className="mt-2 text-sm text-muted-foreground">to score a sign-in</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-3xl bg-muted p-6">
                <p className="tnum text-4xl font-bold">0</p>
                <p className="mt-2 text-sm text-muted-foreground">passwords stored, ever</p>
              </div>
            </Reveal>
            <Reveal delay={180}>
              <div className="rounded-3xl bg-muted p-6">
                <p className="tnum text-4xl font-bold">1 tap</p>
                <p className="mt-2 text-sm text-muted-foreground">to sign in or approve</p>
              </div>
            </Reveal>
          </div>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
