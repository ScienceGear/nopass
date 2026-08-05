import { cn } from "@/lib/utils";

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

export function BalanceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading balance">
      <div className="flex items-center justify-between">
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-6 w-20 rounded-full" />
      </div>
      <Shimmer className="h-11 w-56" />
      <Shimmer className="h-3 w-40" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Shimmer key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="hairline-y" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <Shimmer className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Shimmer className="h-3.5 w-40 max-w-full" />
            <Shimmer className="h-3 w-24" />
          </div>
          <Shimmer className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true">
      <Shimmer className="h-3 w-28" />
      <Shimmer className="h-3.5 w-full" />
      <Shimmer className="h-3.5 w-3/4" />
      <Shimmer className="h-9 w-32 rounded-full" />
    </div>
  );
}
