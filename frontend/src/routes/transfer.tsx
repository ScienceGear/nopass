import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button, MetaLine, Panel, PillBadge } from "@/components/nova/primitives";
import { PasskeyPrompt, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postStepUpVerify, postTransfer } from "@/lib/api";
import { formatINR, STEP_UP_THRESHOLD_MINOR } from "@/lib/mockData";
import { toast } from "sonner";

export const Route = createFileRoute("/transfer")({
  head: () => ({
    meta: [
      { title: "Send money — NovaBank" },
      {
        name: "description",
        content: "Send money in seconds. Transfers above ₹10,000 ask for one extra passkey check.",
      },
      { property: "og:title", content: "Send money with NovaBank" },
      {
        property: "og:description",
        content: "Instant transfers with passkey step-up on large amounts.",
      },
    ],
  }),
  component: Transfer,
});

function Transfer() {
  const navigate = useNavigate();
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [stepUp, setStepUp] = React.useState<{ intentId: string; reference: string } | null>(null);
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");
  const [receipt, setReceipt] = React.useState<{ reference: string; amountMinor: number } | null>(
    null,
  );

  const amountMinor = Math.round((Number(amount) || 0) * 100);
  const needsStepUp = amountMinor >= STEP_UP_THRESHOLD_MINOR;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.trim() || amountMinor <= 0) {
      toast.error("Add a recipient and an amount above zero.");
      return;
    }
    setBusy(true);
    const res = await postTransfer({ recipient, amountMinor, note });
    setBusy(false);
    if (res.requiresStepUp) {
      setStepUp({ intentId: res.intentId, reference: res.reference });
      setPhase("idle");
    } else {
      toast.success("Transfer sent", { description: `${formatINR(amountMinor)} to ${recipient}` });
      setReceipt({ reference: res.reference, amountMinor });
    }
  }

  async function verifyStepUp() {
    if (!stepUp) return;
    setPhase("waiting");
    await postStepUpVerify({ intentId: stepUp.intentId });
    setPhase("success");
    setTimeout(() => {
      setReceipt({ reference: stepUp.reference, amountMinor });
      setStepUp(null);
      toast.success("Transfer verified and sent");
    }, 900);
  }

  return (
    <NovaBackground>
      <PageShell>
        <Navbar variant="app" />

        <div className="mx-auto max-w-[34rem] py-10 sm:py-16">
          {receipt ? (
            <Reveal>
              <Panel className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success/14 text-[oklch(0.52_0.14_152)]">
                  <Check className="size-7" strokeWidth={2.4} />
                </span>
                <h1 className="mt-5 text-2xl">Money sent</h1>
                <p className="tnum mt-2 text-3xl font-bold">{formatINR(receipt.amountMinor)}</p>
                <div className="mt-6 hairline-y rounded-2xl bg-muted px-4 text-left">
                  <MetaLine label="To" value={recipient} />
                  <MetaLine
                    label="Reference"
                    value={<span className="font-mono text-xs">{receipt.reference}</span>}
                  />
                  <MetaLine label="Note" value={note || "—"} />
                  <MetaLine label="Approved by" value="Passkey · this device" />
                </div>
                <Button
                  size="lg"
                  className="mt-6 w-full"
                  onClick={() => navigate({ to: "/dashboard" })}
                >
                  Done
                </Button>
              </Panel>
            </Reveal>
          ) : (
            <Reveal>
              <Panel>
                <PillBadge icon={<ShieldCheck />}>Step-up above ₹10,000</PillBadge>
                <h1 className="mt-4 text-2xl">Send money</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Small transfers go straight through. Large ones ask your device to confirm once
                  more.
                </p>

                <form onSubmit={submit} className="mt-7 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="recipient">Recipient</Label>
                    <Input
                      id="recipient"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Name, UPI ID or account"
                      className="h-12 rounded-2xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (₹)</Label>
                    <Input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="tnum h-14 rounded-2xl text-2xl font-bold"
                    />
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {needsStepUp ? "Passkey check required" : "Instant · no extra step"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="note">Note (optional)</Label>
                    <Textarea
                      id="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Rent, split dinner, invoice #…"
                      className="min-h-24 rounded-2xl"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? "Checking…" : "Review and send"} <ArrowRight className="size-4" />
                  </Button>
                </form>
              </Panel>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Need your history?{" "}
                <Link
                  to="/activity"
                  className="font-semibold text-ink underline-offset-4 hover:underline"
                >
                  View activity
                </Link>
              </p>
            </Reveal>
          )}
        </div>

        <PasskeyPrompt
          open={Boolean(stepUp)}
          onOpenChange={(v) => {
            if (!v && phase !== "waiting") setStepUp(null);
          }}
          title="Verify this transfer"
          description="This one is above your instant limit, so your device signs it before the money moves."
          cta="Verify with Face ID / Touch ID"
          phase={phase}
          onVerify={verifyStepUp}
          detail={
            <div className="hairline-y">
              <MetaLine label="Amount" value={formatINR(amountMinor)} />
              <MetaLine label="To" value={recipient} />
            </div>
          }
        />

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
