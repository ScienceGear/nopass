import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Fingerprint, ScanFace, ShieldCheck } from "lucide-react";
import { Button } from "./primitives";
import { cn } from "@/lib/utils";

export type PasskeyPhase = "idle" | "waiting" | "success" | "error";

/**
 * The single passkey-verification surface. Used at signup, login and transfer
 * step-up — one component, three trigger points.
 * Full-screen sheet on mobile, centered dialog on desktop.
 */
export function PasskeyPrompt({
  open,
  onOpenChange,
  title,
  description,
  cta = "Continue with Face ID / Touch ID",
  phase,
  error,
  onVerify,
  detail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  cta?: string;
  phase: PasskeyPhase;
  error?: string | null;
  onVerify: () => void;
  detail?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 h-full w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-card p-6 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem] sm:border sm:p-8">
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center sm:justify-start">
          <PasskeyGlyph phase={phase} />
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{phase === "success" ? "Verified" : title}</h2>
            <p className="mx-auto max-w-[22rem] text-sm leading-relaxed text-muted-foreground">
              {phase === "waiting"
                ? "Waiting for your device… confirm the prompt on your screen."
                : phase === "success"
                  ? "Your device signed the challenge. Nothing was typed, nothing was sent."
                  : description}
            </p>
          </div>

          {detail ? (
            <div className="w-full rounded-2xl bg-muted px-4 py-3 text-left">{detail}</div>
          ) : null}

          {error ? (
            <p className="w-full rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {phase !== "success" ? (
            <Button size="lg" className="w-full" disabled={phase === "waiting"} onClick={onVerify}>
              {phase === "waiting" ? (
                "Waiting for your device…"
              ) : (
                <>
                  <ScanFace className="size-[1.05rem]" /> {cta}
                </>
              )}
            </Button>
          ) : null}

          <p className="flex items-center justify-center gap-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> FIDO2 · key never leaves your device
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PasskeyGlyph({ phase, className }: { phase: PasskeyPhase; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-20 shrink-0 place-items-center rounded-[1.5rem] transition-colors duration-300",
        phase === "success" ? "bg-success/14 text-primary" : "bg-lime-soft text-ink",
        className,
      )}
    >
      {phase === "waiting" ? (
        <span className="absolute inset-0 animate-ping rounded-[1.5rem] bg-lime/30" />
      ) : null}
      {phase === "success" ? (
        <svg viewBox="0 0 24 24" className="size-9" fill="none" aria-hidden="true">
          <path
            d="m5 12.8 4.4 4.2L19 7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="check-draw"
          />
        </svg>
      ) : (
        <Fingerprint className="size-9" />
      )}
    </span>
  );
}
