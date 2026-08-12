import * as React from "react";
import { MousePointerClick, Shuffle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PccpClickWithTiming, PccpImage } from "@/lib/api";

/**
 * Fullscreen sequential click-point capture, shared by PCCP registration and
 * login. Each image fades in, accepts one click, then advances. Timing
 * (time-to-click per image + inter-click gap) is captured for the server's
 * per-device-class behavioural baseline.
 *
 * `showViewport` is the "persuasive" registration mode: a highlighted region
 * covers ~40% of each image and clicks outside it are rejected (up to 2
 * shuffles re-position it). Coordinates are normalised 0..1 — the backend
 * quantises and hashes them, so raw pixels never leave the browser.
 */

const FADE_MS = 150;
const CAPTURE_PAUSE_MS = 200;
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

  const revealAtRef = React.useRef(0);
  const lastClickAtRef = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const submittingRef = React.useRef(false);

  const done = clicks.length >= images.length;

  // Guard against an empty image list — parents only mount us with 3 images,
  // but indexing below would otherwise be unsafe.
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

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || fading || submittingRef.current || done) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    // Persuasive viewport: ignore clicks outside the highlighted region.
    if (viewport && (x < viewport.left || x > viewport.left + VIEWPORT_SIZE || y < viewport.top || y > viewport.top + VIEWPORT_SIZE)) {
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
      pointerType: e.pointerType === "pen" ? "stylus" : (e.pointerType as "mouse" | "touch") || "mouse",
    };
    lastClickAtRef.current = now;
    setViewMessage(null);
    setError(null);

    const next = [...clicks, click];
    setClicks(next);

    // Short pause so the ripple shows, then advance or auto-submit.
    window.setTimeout(() => {
      if (next.length === images.length) {
        submittingRef.current = true;
        onComplete(next)
          .catch((err) => {
            setError(err instanceof Error ? err.message : "That didn't work — try again.");
            setClicks([]);
            setIndex(0);
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0e1a]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-lime-soft text-ink">
            <MousePointerClick className="size-4" />
          </span>
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/50">
            Image {index + 1} of {images.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {images.map((img, i) => (
              <span
                key={img.id}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-6 bg-lime" : i < index ? "w-1.5 bg-lime/50" : "w-1.5 bg-white/20",
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
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          className={cn(
            "relative max-h-[80vh] w-full max-w-7xl cursor-crosshair touch-none select-none",
            !fading && !done && "cursor-crosshair",
          )}
        >
          <img
            key={currentImage.id}
            src={currentImage.url}
            alt={`Click-point image ${index + 1}`}
            draggable={false}
            className={cn(
              "mx-auto max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10 transition-opacity duration-150",
              fading ? "opacity-0" : "opacity-100",
            )}
          />

          {/* Persuasive highlight region (registration only) */}
          {showViewport && viewport && !capturedThisImage && !done ? (
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-dashed border-lime/70 bg-lime/10"
              style={{
                left: `${viewport.left * 100}%`,
                top: `${viewport.top * 100}%`,
                width: `${VIEWPORT_SIZE * 100}%`,
                height: `${VIEWPORT_SIZE * 100}%`,
              }}
            />
          ) : null}

          {/* Click feedback: a one-shot ping ring + persistent numbered dot */}
          {clicks[index] ? (
            <>
              <span
                className="pointer-events-none absolute z-10 size-2.5 animate-ping-once rounded-full bg-lime/80"
                style={{ left: `${clicks[index].x * 100}%`, top: `${clicks[index].y * 100}%` }}
              />
              <span
                className="pointer-events-none absolute z-10 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lime text-sm font-bold text-ink shadow-lg ring-2 ring-lime/30"
                style={{ left: `${clicks[index].x * 100}%`, top: `${clicks[index].y * 100}%` }}
              >
                {index + 1}
              </span>
            </>
          ) : null}
        </div>

        {/* Persuasive hint + shuffle */}
        {showViewport && !done ? (
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
      {!done ? (
        <footer className="px-4 pb-4 text-center sm:px-6 sm:pb-6">
          {error ? (
            <p className="mx-auto max-w-md rounded-2xl bg-destructive/15 px-4 py-3 text-sm text-[oklch(0.75_0.17_25)]">
              {error}
            </p>
          ) : (
            <p className="text-sm text-white/45">
              {showViewport
                ? "Click once inside the highlighted area on each picture."
                : "Click the same spot you chose on each picture."}
            </p>
          )}
        </footer>
      ) : null}
    </div>
  );
}
