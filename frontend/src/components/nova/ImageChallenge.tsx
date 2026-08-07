import * as React from "react";
import { MousePointerClick, RotateCcw } from "lucide-react";
import { Button } from "@/components/nova/primitives";
import type { ChallengeClick, ImageChallenge as ImageChallengeData } from "@/lib/api";

/**
 * Image-sequence step-up (Phase 8): click the prompted objects on a scene in
 * the given order. Coordinates are sent normalized to the image's rendered box;
 * the backend verifies against its stored bounding boxes with a tolerance.
 */
export function ImageChallenge({
  challenge,
  busy,
  onSolve,
  onNewChallenge,
}: {
  challenge: ImageChallengeData;
  busy?: boolean;
  onSolve: (challengeToken: string, clicks: ChallengeClick[]) => Promise<void> | void;
  onNewChallenge: () => Promise<void> | void;
}) {
  const [clicks, setClicks] = React.useState<ChallengeClick[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const solving = React.useRef(false);

  const targetCount = challenge.prompt.length;
  const done = clicks.length >= targetCount;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (busy || done || solving.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setClicks((prev) => [...prev, { x, y }]);
  }

  React.useEffect(() => {
    if (!done || solving.current) return;
    solving.current = true;
    (async () => {
      try {
        await onSolve(challenge.challengeToken, clicks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't work  try again.");
        setClicks([]);
      } finally {
        solving.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Click the {targetCount} objects below, in order:</p>
        <div className="flex flex-wrap gap-2">
          {challenge.prompt.map((label, i) => {
            const placed = i < clicks.length;
            return (
              <span
                key={label}
                className={`rounded-full px-3 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] ${
                  placed ? "bg-lime text-ink" : "bg-muted text-muted-foreground"
                }`}
              >
                {placed ? "✓ " : `${i + 1}. `}
                {label}
              </span>
            );
          })}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Click the prompted objects on the image"
        onMouseDown={handleClick}
        className="relative aspect-[320/200] cursor-crosshair overflow-hidden rounded-2xl border border-[oklch(0.207_0.014_251_/_0.09)] shadow-card"
      >
        <div
          className="absolute inset-0"
          // The SVG is generated server-side with fixed ids per scene; it is
          // intentionally static (no user input), so rendering it here is safe.
          dangerouslySetInnerHTML={{ __html: challenge.image.svg }}
        />
        {clicks.map((c, i) => (
          <span
            key={i}
            className="pointer-events-none absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lime text-sm font-bold text-ink shadow-lg"
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <MousePointerClick className="size-3.5" />
          {done ? "Checking…" : `${Math.max(0, targetCount - clicks.length)} to go`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || done}
          onClick={async () => {
            setClicks([]);
            setError(null);
            await onNewChallenge();
          }}
        >
          <RotateCcw className="size-3.5" /> Different picture
        </Button>
      </div>

      {error ? (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
