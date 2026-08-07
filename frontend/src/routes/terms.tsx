import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Scale } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service  NovaBank" },
      {
        name: "description",
        content: "The terms that apply when you use the NovaBank demo.",
      },
      { property: "og:title", content: "Terms of service" },
    ],
  }),
  component: Terms,
});

const sections = [
  {
    title: "What this is",
    body: "NovaBank is a demonstration product that shows passwordless authentication. It is not a licensed bank, does not hold deposits, and does not provide financial services. Money shown in the demo is simulated.",
  },
  {
    title: "Passkeys",
    body: "When you create a passkey, a key pair is generated on your device. NovaBank stores only the public half. Your private key never leaves your device, so a breach of our servers cannot be used to sign in as you.",
  },
  {
    title: "Your data",
    body: "We store the minimum needed to run the demo: your name, email, device identifiers and login history. We never store passwords in plaintext. You can see every signal we collect on your Activity page and revoke sessions at any time.",
  },
  {
    title: "Recovery codes",
    body: "Recovery codes are shown exactly once at sign-up and stored only as irreversible hashes. If you lose them and every device, you lose access  we cannot recover them for you.",
  },
  {
    title: "Availability",
    body: 'This demo is provided "as is", without warranty of any kind. We may change or retire the service at any time, with or without notice.',
  },
  {
    title: "Changes",
    body: "We may update these terms as the product evolves. Continuing to use NovaBank after changes means you accept the updated terms.",
  },
];

function Terms() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<Scale />}>Terms of service</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[40rem] text-[2.1rem] leading-[1.05] sm:text-5xl">
              Simple terms for a simple demo
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[32rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Last updated August 2026. This page is short on purpose  no dark patterns, no
              legalese hiding in a wall of text.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-[42rem] pt-16 sm:pt-20">
          <div className="space-y-6">
            {sections.map((s, i) => (
              <Reveal key={s.title} delay={i * 60}>
                <div className="rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 sm:p-8">
                  <p className="eyebrow">0{i + 1}</p>
                  <h2 className="mt-2 text-lg font-semibold">{s.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80} className="mt-10 text-center">
            <p className="text-sm text-muted-foreground">
              Questions about these terms?{" "}
              <Link
                to="/contact"
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                Contact us
              </Link>
            </p>
          </Reveal>

          <Reveal delay={120} className="mt-8 flex justify-center">
            <Button asChild>
              <Link to="/signup">
                Open a demo account <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
