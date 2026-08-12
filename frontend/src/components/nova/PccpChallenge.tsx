import * as React from "react";
import { Loader2, MousePointerClick, Shuffle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PccpClickWithTiming, PccpImage } from "@/lib/api";

/**
 * Fullscreen sequential click-point capture, shared by PCCP registration and login.
 * Each image fades in, accepts one click on the rendered image canvas, then advances.
 * Timing (time-to-click per image + inter-click gap) is captured for the server's
 * per-device-class behavioural baseline.
 */

const FADE_MS = 120;
const CAPTURE_PAUSE_MS = 180;
const VIEWPORT_SIZE = 0.63; // 63% × 63% ≈ 40% of the image area

function randomViewport(): { left: number; top: number } {
  const maxOffset = 1 - VIEWPORT_SIZE;
  return { left: Math.random() * maxOffset, top: Math.random() * maxOffset };
}

export function PccpChallenge({
  images,
  showViewport = false,
  busy = false,
  onComplete,
  onCancel,
}: {
  images: PccpImage[];
  showViewport?: boolean;
  busy?: boolean;
  onComplete: (clicks: PccpClickWithTiming[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const [clicks, setClicks] = React.useState<PccpClickWithTiming[]>([]);
  const [fading, setFading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewport, setViewport] = React.useState(() => (showViewport ? randomViewport() : null));
  const [shufflesLeft, setShufflesLeft] = React.useState(2);
  const [viewMessage, setViewMessage] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const revealAtRef = React.useRef(0);
  const lastClickAtRef = React.useRef(0);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const submittingRef = React.useRef(false);

  const done = clicks.length >= images.length;

  if (images.length === 0) return null;

  // Fade-in each image, then arm click capture and start the reveal timer.
  React.useEffect(() => {
    setFading(true);
    const t = window.setTimeout(() => {
      revealAtRef.current = performance.now();
      setFading(false);
    }, FADE_MS);
    return () => window.clearTimeout(t);
  }, [index]);

  function handlePointerDown(e: React.PointerEvent<HTMLImageElement | HTMLDivElement>) {
    if (busy || fading || submittingRef.current || submitting || done) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    // Persuasive viewport: ignore clicks outside the highlighted region.
    if (
      viewport &&
      (x < viewport.left ||
        x > viewport.left + VIEWPORT_SIZE ||
        y < viewport.top ||
        y > viewport.top + VIEWPORT_SIZE)
    ) {
      setViewMessage("Click inside the highlighted area.");
      window.setTimeout(() => setViewMessage(null), 1400);
      return;
    }

    const now = performance.now();
    const click: PccpClickWithTiming = {
      x,
      y,
      timeToClick: Math.max(0, now - revealAtRef.current),
      interClick: clicks.length > 0 ? Math.max(0, now - lastClickAtRef.current) : 0,
      pointerType:
        e.pointerType === "pen" ? "stylus" : (e.pointerType as "mouse" | "touch") || "mouse",
    };
    lastClickAtRef.current = now;
    setViewMessage(null);
    setError(null);

    const next = [...clicks, click];
    setClicks(next);

    // Short pause so the click dot shows, then advance or submit with loading overlay
    window.setTimeout(() => {
      if (next.length === images.length) {
        submittingRef.current = true;
        setSubmitting(true);
        onComplete(next)
          .catch((err) => {
            setError(err instanceof Error ? err.message : "That didn't match — try again.");
            setClicks([]);
            setIndex(0);
            setSubmitting(false);
          })
          .finally(() => {
            submittingRef.current = false;
          });
      } else {
        setIndex((i) => i + 1);
        if (showViewport) {
          setViewport(randomViewport());
          setShufflesLeft(2);
        }
      }
    }, CAPTURE_PAUSE_MS);
  }

  const currentImage = images[Math.min(index, images.length - 1)]!;
  const capturedThisImage = clicks.length > index;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a] text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-lime-soft text-ink">
            <MousePointerClick className="size-4" />
          </span>
          <div>
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              Picture {index + 1} of {images.length}
            </span>
            <span className="block text-[0.6875rem] text-white/50">
              {showViewport ? "Set up your click-points" : "Click your memorised spot"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {images.map((img, i) => (
              <span
                key={img.id}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === index
                    ? "w-7 bg-lime"
                    : i < clicks.length
                      ? "w-2 bg-lime/60"
                      : "w-2 bg-white/20",
                )}
              />
            ))}
          </div>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel"
              className="grid size-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </header>

      {/* Stage */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
        <div className="relative flex max-h-[78vh] w-full max-w-5xl items-center justify-center">
          <div
            className={cn(
              "relative inline-block overflow-hidden rounded-2xl touch-none select-none shadow-2xl ring-1 ring-white/15",
              !fading && !submitting && "cursor-crosshair",
            )}
            onPointerDown={handlePointerDown}
          >
            <img
              ref={imgRef}
              key={currentImage.id}
              src={currentImage.url}
              alt={`Click-point image ${index + 1}`}
              draggable={false}
              className={cn(
                "block max-h-[75vh] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-150",
                fading ? "opacity-0" : "opacity-100",
              )}
            />

            {/* Persuasive highlight region (registration only) */}
            {showViewport && viewport && !capturedThisImage && !submitting ? (
              <div
                className="pointer-events-none absolute rounded-xl border-2 border-dashed border-lime bg-lime/15 shadow-[0_0_20px_rgba(202,255,51,0.2)]"
                style={{
                  left: `${viewport.left * 100}%`,
                  top: `${viewport.top * 100}%`,
                  width: `${VIEWPORT_SIZE * 100}%`,
                  height: `${VIEWPORT_SIZE * 100}%`,
                }}
              />
            ) : null}

            {/* Click feedback: ping ring + persistent numbered dot relative to image */}
            {clicks[index] ? (
              <>
                <span
                  className="pointer-events-none absolute z-10 size-3 animate-ping-once rounded-full bg-lime/80"
                  style={{
                    left: `${clicks[index].x * 100}%`,
                    top: `${clicks[index].y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <span
                  className="pointer-events-none absolute z-10 grid size-8 place-items-center rounded-full bg-lime text-sm font-bold text-ink shadow-lg ring-4 ring-lime/30"
                  style={{
                    left: `${clicks[index].x * 100}%`,
                    top: `${clicks[index].y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {index + 1}
                </span>
              </>
            ) : null}

            {/* Submission loading overlay */}
            {submitting ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 p-6 text-center backdrop-blur-sm">
                <Loader2 className="size-11 animate-spin text-lime" />
                <p className="mt-4 text-lg font-bold text-white">Verifying your 3 click-points…</p>
                <p className="mt-1 max-w-xs text-xs text-white/60">
                  Matching grid coordinates &amp; analyzing behavioral timing profile
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Persuasive hint + shuffle */}
        {showViewport && !submitting ? (
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
            {viewMessage ? (
              <span className="rounded-full bg-warning/20 px-4 py-2 text-sm font-medium text-[oklch(0.85_0.14_85)]">
                {viewMessage}
              </span>
            ) : null}
            {shufflesLeft > 0 && !capturedThisImage ? (
              <button
                type="button"
                onClick={() => {
                  setViewport(randomViewport());
                  setShufflesLeft((s) => s - 1);
                }}
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/20"
              >
                <Shuffle className="size-4" /> Shuffle highlight ({shufflesLeft})
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      {/* Footer hint */}
      <footer className="border-t border-white/10 px-4 py-3 text-center sm:px-6">
        {error ? (
          <div className="mx-auto flex max-w-md items-center justify-between rounded-xl bg-destructive/20 px-4 py-2.5 text-sm text-[oklch(0.85_0.12_25)]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setClicks([]);
                setIndex(0);
              }}
              className="ml-3 font-semibold underline hover:text-white"
            >
              Try again
            </button>
          </div>
        ) : submitting ? (
          <p className="text-sm text-lime/90 font-medium animate-pulse">
            Processing click-point sequence…
          </p>
        ) : (
          <p className="text-sm text-white/60">
            {showViewport
              ? `Picture ${index + 1}: Click once inside the highlighted area.`
              : `Picture ${index + 1}: Tap your memorised spot on the image.`}
          </p>
        )}
      </footer>
    </div>
  );
}
