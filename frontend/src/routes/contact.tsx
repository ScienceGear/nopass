import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, Headset, Mail, MapPin } from "lucide-react";
import { Button, PillBadge } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { support } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact NovaBank" },
      {
        name: "description",
        content: "Reach NovaBank support  a real human answers, usually within a day.",
      },
      { property: "og:title", content: "Contact us" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.includes("@") || message.trim().length < 10) {
      toast.error("Please add your name, a valid email and a short message.");
      return;
    }
    setBusy(true);
    const subject = encodeURIComponent(`NovaBank message from ${name.trim()}`);
    const body = encodeURIComponent(`${message.trim()}\n\n ${name.trim()} (${email.trim()})`);
    window.location.href = `mailto:${support.email}?subject=${subject}&body=${body}`;
    toast.success("Opening your mail app…");
    setBusy(false);
  }

  return (
    <NovaBackground>
      <PageShell>
        <Navbar />

        <section className="pt-12 text-center sm:pt-20">
          <Reveal className="flex justify-center">
            <PillBadge icon={<Headset />}>Contact</PillBadge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mx-auto mt-6 max-w-[40rem] text-[2.1rem] leading-[1.05] sm:text-5xl">
              Talk to a human
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mx-auto mt-5 max-w-[32rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Questions about passkeys, your sessions, or the demo itself  write to us and
              we&apos;ll reply, usually within a day.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto grid max-w-[56rem] gap-4 pt-14 sm:pt-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Reveal>
            <form
              onSubmit={submit}
              className="rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="h-12 rounded-2xl"
                  autoComplete="name"
                />
              </div>
              <div className="mt-5 space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="h-12 rounded-2xl"
                  autoComplete="email"
                />
              </div>
              <div className="mt-5 space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What can we help with?"
                  className="min-h-32 rounded-2xl"
                />
              </div>
              <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
                Send message <ArrowRight className="size-4" />
              </Button>
              <p className="mt-3 text-center font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground">
                Opens your mail app · {support.email}
              </p>
            </form>
          </Reveal>

          <Reveal delay={100}>
            <div className="flex h-full flex-col gap-3">
              {[
                {
                  icon: <Mail className="size-4" />,
                  label: "Email",
                  value: support.email,
                },
                {
                  icon: <MapPin className="size-4" />,
                  label: "Project",
                  value: "NovaBank · a demo product, not a real bank",
                },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-4 rounded-3xl bg-muted p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-ink">
                    {r.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="eyebrow">{r.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold">{r.value}</p>
                  </div>
                </div>
              ))}
              <div className="mt-auto rounded-3xl bg-lime-soft p-5">
                <p className="text-sm font-semibold">Prefer reading first?</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Everything you need is documented on our{" "}
                  <Link
                    to="/privacy"
                    className="font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    privacy
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/terms"
                    className="font-semibold text-ink underline-offset-4 hover:underline"
                  >
                    terms
                  </Link>{" "}
                  pages.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
