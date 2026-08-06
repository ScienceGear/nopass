import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { ArrowRight, Check, MailCheck, ShieldCheck, ImageIcon } from "lucide-react";
import { Button, MetaLine, Panel, PillBadge } from "@/components/nova/primitives";
import { ImageChallenge } from "@/components/nova/ImageChallenge";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatINR,
  postTransfer,
  postTransferConfirm,
  postImageChallengeSetup,
  type ImageChallenge as ImageChallengeData,
} from "@/lib/api";
import { useKeystrokeCapture } from "@/lib/keystroke";
import { toast } from "sonner";

export const Route = createFileRoute("/transfer")({
  head: () => ({
    meta: [
      { title: "Send money — NovaBank" },
      {
        name: "description",
        content: "Send money in seconds. Transfers above ₹50,000 ask for one extra check.",
      },
      { property: "og:title", content: "Send money with NovaBank" },
      {
        property: "og:description",
        content: "Instant transfers with step-up verification on large amounts.",
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
  const [stepUp, setStepUp] = React.useState<{
    transferToken: string;
    reference: string;
    devOtp?: string;
    method?: "otp_email" | "image_challenge";
    challenge?: ImageChallengeData;
  } | null>(null);
  const [method, setMethod] = React.useState<"otp_email" | "image_challenge">("otp_email");
  const [otp, setOtp] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{ reference: string; amountMinor: number } | null>(
    null,
  );
  const otpKeys = useKeystrokeCapture();

  const amountMinor = Math.round((Number(amount) || 0) * 100);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.trim() || amountMinor <= 0) {
      toast.error("Add a recipient and an amount above zero.");
      return;
    }
    setBusy(true);
    try {
      const res = await postTransfer({ recipient, amountMinor, note });
      if (res.requiresStepUp) {
        setStepUp({
          transferToken: res.intentId,
          reference: res.reference,
          ...(res.devOtp ? { devOtp: res.devOtp } : {}),
          ...(res.method ? { method: res.method } : {}),
          ...(res.challenge ? { challenge: res.challenge } : {}),
        });
        if (res.method === "image_challenge") {
          setMethod("image_challenge");
          toast.info("One more step", {
            description: "Tap the objects shown to confirm this transfer.",
          });
        } else {
          setMethod("otp_email");
          setOtp(res.devOtp ?? "");
          toast.info("One more step", {
            description: "We emailed a code to confirm this transfer.",
          });
        }
      } else {
        toast.success("Transfer sent", {
          description: `${formatINR(amountMinor)} to ${recipient}`,
        });
        setReceipt({ reference: res.reference, amountMinor });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setBusy(false);
    }
  }

  async function solveImageChallenge(challengeToken: string, clicks: { x: number; y: number }[]) {
    if (!stepUp) return;
    setConfirming(true);
    try {
      await postTransferConfirm({
        transferToken: stepUp.transferToken,
        method: "image_challenge",
        challengeToken,
        clicks,
      });
      setReceipt({ reference: stepUp.reference, amountMinor });
      setStepUp(null);
      toast.success("Transfer verified and sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't match — try again.");
      throw err;
    } finally {
      setConfirming(false);
    }
  }

  async function newChallenge() {
    if (!stepUp) return;
    const next = await postImageChallengeSetup();
    setStepUp({ ...stepUp, challenge: next });
  }

  async function confirmStepUp(e: React.FormEvent) {
    e.preventDefault();
    if (!stepUp) return;
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setConfirming(true);
    try {
      await postTransferConfirm({ transferToken: stepUp.transferToken, method: "otp_email", otp });
      setReceipt({ reference: stepUp.reference, amountMinor });
      setStepUp(null);
      toast.success("Transfer verified and sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't match.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />

          <div className="mx-auto max-w-[34rem] py-10 sm:py-16">
            {receipt ? (
              <Reveal>
                <Panel className="text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success/14 text-primary">
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
            ) : stepUp ? (
              <Reveal>
                <Panel>
                  <PillBadge icon={method === "image_challenge" ? <ImageIcon /> : <MailCheck />}>
                    Confirm this transfer
                  </PillBadge>
                  <h1 className="mt-4 text-2xl">One last check</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {formatINR(amountMinor)} to{" "}
                    <span className="font-medium text-ink">{recipient}</span>
                    {method === "image_challenge"
                      ? " needs a visual confirmation. Click the objects shown in order."
                      : " is above your instant limit. We emailed a 6-digit code to your inbox."}
                  </p>

                  <div className="mt-5 hairline-y rounded-2xl bg-muted px-4 text-left">
                    <MetaLine label="Amount" value={formatINR(amountMinor)} />
                    <MetaLine label="To" value={recipient} />
                    <MetaLine
                      label="Reference"
                      value={<span className="font-mono text-xs">{stepUp.reference}</span>}
                    />
                  </div>

                  {method === "image_challenge" && stepUp.challenge ? (
                    <div className="mt-6">
                      <ImageChallenge
                        challenge={stepUp.challenge}
                        busy={confirming}
                        onSolve={solveImageChallenge}
                        onNewChallenge={newChallenge}
                      />
                    </div>
                  ) : (
                    <form onSubmit={confirmStepUp} className="mt-6 space-y-4">
                      <Input
                        autoFocus
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={otpKeys.onKeyDown}
                        placeholder="••••••"
                        className="tnum h-14 rounded-2xl text-center font-mono text-xl tracking-[0.4em]"
                      />
                      <Button type="submit" size="lg" className="w-full" disabled={confirming}>
                        {confirming ? "Verifying…" : "Confirm and send"}{" "}
                        <ArrowRight className="size-4" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setStepUp(null);
                          setOtp("");
                        }}
                        className="w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                      >
                        ← Change amount
                      </button>
                    </form>
                  )}
                </Panel>
              </Reveal>
            ) : (
              <Reveal>
                <Panel>
                  <PillBadge icon={<ShieldCheck />}>Risk-scored step-up</PillBadge>
                  <h1 className="mt-4 text-2xl">Send money</h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Small transfers on a known device go straight through. Large or unusual ones ask
                    you to confirm once more.
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
                        {amountMinor >= 5_000_000
                          ? "Extra verification required"
                          : "Usually instant · extra check if unusual"}
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

          <Footer />
        </PageShell>
      </NovaBackground>
    </RequireAuth>
  );
}
