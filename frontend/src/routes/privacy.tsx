import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button, PillBadge, SectionHeading } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy  NovaBank" },
      {
        name: "description",
        content: "What NovaBank stores, what it never sees, and how your data is protected.",
      },
      { property: "og:title", content: "Privacy" },
    ],
  }),
  component: Privacy,
});

const sections = [
  {
    title: "What we store",
    body: "Your name, email, the public half of your passkeys, device identifiers, and a log of sign-ins and transfers. That is the complete list  there is no hidden profiling.",
  },
  {
    title: "What we never store",
    body: "Passwords. Your passkey is generated on your device and the private key never leaves it. Even recovery codes are stored only as one-way hashes, so a database leak reveals nothing usable.",
  },
  {
    title: "Why we log sign-ins",
    body: "Every session is scored by our risk engine  device, location, typing rhythm and frequency. That history powers the security alerts you see, and you can read the full log on your Activity page.",
  },
  {
    title: "Signals we don't collect",
    body: "We don't read your messages, track you across other sites, or sell data to anyone. The demo has no advertising and no third-party trackers.",
  },
  {
    title: "Session control",
    body: "You can revoke any session  or every session at once  from the Activity page. A confirmation email is sent whenever a session is signed in from an unusual place.",
  },
  {
    title: "Contact",
    body: "For privacy questions, reach us on the Contact page. We'll answer from a human, not a bot.",
  },
];

function Privacy() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<ShieldCheck />}>Privacy</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[40rem] text-[2.1rem] leading-[1.05] sm:text-5xl">
              Your privacy is the product
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[32rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Last updated August 2026. Written in plain language, because privacy shouldn&apos;t
              need a translator.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[42rem] pt-16 sm:pt-20">
          <Reveal>
            <SectionHeading
              eyebrow="At a glance"
              title="Two sentences that say it all"
              sub="We store only what keeps your account working, and we never have a password to lose."
            />
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Reveal delay={60}>
              <div className="h-full rounded-3xl bg-muted p-6">
                <p className="text-sm font-semibold">Stored</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Name, email, public keys, device IDs and your login history.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="h-full rounded-3xl bg-success/10 p-6">
                <p className="text-sm font-semibold">Never stored</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Passwords. Private keys. Plaintext recovery codes. Ever.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="mt-10 space-y-6">
            {sections.map((s, i) => (
              <Reveal key={s.title} delay={i * 40}>
                <div className="rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 sm:p-8">
                  <p className="eyebrow">0{i + 1}</p>
                  <h2 className="mt-2 text-lg font-semibold">{s.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80} className="mt-10 flex justify-center">
            <Button asChild>
              <Link to="/signup">
                Try it  nothing to hide <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
