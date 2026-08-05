import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Leaf } from "lucide-react";
import { Button, PillBadge, SectionHeading } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About NovaBank" },
      {
        name: "description",
        content:
          "NovaBank is a demo of passwordless banking built on passkeys and live risk scoring.",
      },
      { property: "og:title", content: "About NovaBank" },
      { property: "og:description", content: "Banking that can't be phished — a demo product." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<Leaf />}>Demo product</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[40rem] text-[2.1rem] leading-[1.05] sm:text-6xl">
              Built to Show What Passwordless Banking Feels Like
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[32rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              NovaBank is a working demo: real passkeys (WebAuthn), a real risk engine, real
              sessions — and no password anywhere in the stack.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 flex justify-center">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Try the demo <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </section>

        <section className="pt-24 sm:pt-32">
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="A full-stack demo, top to bottom"
              sub="Express API, Postgres, Redis, WebAuthn on both sides, and a risk engine scoring every session."
            />
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Passkeys", "WebAuthn registration & assertion on every device"],
              ["Risk engine", "Device, location, behaviour and velocity signals"],
              ["Step-up", "OTP or re-confirmation for unusual sessions & large transfers"],
              ["Session control", "Live activity, one-tap revoke from any device"],
            ].map(([title, description], i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="h-full rounded-3xl bg-muted p-6">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
