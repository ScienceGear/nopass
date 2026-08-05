import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, MapPin, MonitorSmartphone, Smartphone } from "lucide-react";
import { Button, MetaLine, PillBadge } from "@/components/nova/primitives";
import { PasskeyGlyph, type PasskeyPhase } from "@/components/nova/PasskeyPrompt";
import { Logo, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Shimmer } from "@/components/nova/skeletons";
import { getQrStatus, postQrApprove, postQrCreate } from "@/lib/api";
import { saveSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/login/approve")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search["t"] === "string" ? (search["t"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Approve a NovaBank sign-in from your phone" },
      {
        name: "description",
        content:
          "Scan the code with your phone and approve with a passkey. Nothing is typed on the new device.",
      },
      { property: "og:title", content: "Approve a NovaBank sign-in" },
      { property: "og:description", content: "Cross-device passkey approval in one tap." },
    ],
  }),
  component: ApprovePage,
});

function ApprovePage() {
  const { t } = Route.useSearch();
  return (
    <NovaBackground>
      <PageShell className="min-h-[calc(100vh-4rem)]">
        <header className="py-4">
          <Logo />
        </header>
        <div className="flex min-h-[70vh] items-center justify-center py-8">
          {t ? <MobileApprove token={t} /> : <DesktopQr />}
        </div>
      </PageShell>
    </NovaBackground>
  );
}

/* ── Desktop: show QR, poll for approval ───────────────────────────────── */

function DesktopQr() {
  const navigate = useNavigate();
  const [payload, setPayload] = React.useState<{ pollToken: string; payloadUrl: string } | null>(
    null,
  );
  const [status, setStatus] = React.useState<"pending" | "approved">("pending");

  React.useEffect(() => {
    let attempt = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      const created = await postQrCreate();
      if (cancelled) return;
      setPayload(created);

      const poll = async () => {
        attempt += 1;
        const res = await getQrStatus(created.pollToken, attempt);
        if (cancelled) return;
        if (res.status === "approved") {
          setStatus("approved");
          saveSession({ token: res.session?.token ?? "demo", name: "Rohan Patil" });
          toast.success("Approved on your phone");
          timer = setTimeout(() => navigate({ to: "/dashboard" }), 1100);
        } else {
          timer = setTimeout(poll, 1400);
        }
      };
      timer = setTimeout(poll, 1200);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <Reveal className="w-full max-w-[27rem]">
      <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 text-center shadow-card sm:p-8">
        <PillBadge tone="white" icon={<MonitorSmartphone />}>
          Cross-device sign-in
        </PillBadge>
        <h1 className="mt-4 text-2xl">Scan with your phone to sign in</h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-sm leading-relaxed text-muted-foreground">
          Your phone holds the passkey. This screen never sees it — it only learns that your phone
          said yes.
        </p>

        <div className="mx-auto mt-7 grid size-[15rem] place-items-center rounded-3xl bg-lime-soft p-4">
          {payload ? (
            status === "approved" ? (
              <span className="grid size-20 place-items-center rounded-3xl bg-card text-[oklch(0.52_0.14_152)]">
                <Check className="size-10" strokeWidth={2.4} />
              </span>
            ) : (
              <QRCodeSVG
                value={payload.payloadUrl}
                size={196}
                bgColor="transparent"
                fgColor="#12181F"
                level="M"
              />
            )
          ) : (
            <Shimmer className="size-[12.25rem] rounded-2xl" />
          )}
        </div>

        <p
          className={`mt-6 font-mono text-[0.6875rem] uppercase tracking-[0.14em] ${
            status === "approved" ? "text-[oklch(0.52_0.14_152)]" : "text-muted-foreground"
          }`}
        >
          {status === "approved" ? "Approved ✓ · opening your account" : "Waiting for approval…"}
        </p>

        <div className="mt-6 hairline-y border-t border-[oklch(0.207_0.014_251_/_0.07)] text-left">
          <MetaLine label="Requested by" value="MacBook Air · Chrome" />
          <MetaLine label="Location" value="Pune, India" />
          <MetaLine label="Expires in" value="2:00" />
        </div>

        <Link
          to="/login"
          className="mt-6 inline-block text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
        >
          Use a passkey on this device instead
        </Link>
      </div>
    </Reveal>
  );
}

/* ── Mobile: opened from the scanned code ──────────────────────────────── */

function MobileApprove({ token }: { token: string }) {
  const [phase, setPhase] = React.useState<PasskeyPhase>("idle");

  async function approve() {
    setPhase("waiting");
    await postQrApprove({ pollToken: token });
    setPhase("success");
    toast.success("Sign-in approved");
  }

  return (
    <Reveal className="w-full max-w-[24rem]">
      <div className="rounded-[1.75rem] border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 text-center shadow-card">
        <div className="flex justify-center">
          <PasskeyGlyph phase={phase} />
        </div>
        <h1 className="mt-6 text-2xl">
          {phase === "success" ? "Approved" : "Approve sign-in to NovaBank?"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {phase === "success"
            ? "You can close this and return to your laptop."
            : "Only approve this if you started the sign-in yourself."}
        </p>

        <div className="mt-6 hairline-y rounded-2xl bg-muted px-4 text-left">
          <MetaLine
            label="Device"
            value={
              <span className="flex items-center gap-1.5">
                <MonitorSmartphone className="size-3.5" /> MacBook Air · Chrome
              </span>
            }
          />
          <MetaLine
            label="Location"
            value={
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> Pune, India
              </span>
            }
          />
          <MetaLine label="Request" value={<span className="font-mono text-xs">{token}</span>} />
        </div>

        {phase !== "success" ? (
          <div className="mt-6 space-y-2">
            <Button size="lg" className="w-full" disabled={phase === "waiting"} onClick={approve}>
              <Smartphone className="size-[1.05rem]" />
              {phase === "waiting" ? "Waiting for your device…" : "Approve with passkey"}
            </Button>
            <Button variant="ghost" size="lg" className="w-full" asChild>
              <Link to="/login">Deny</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}
