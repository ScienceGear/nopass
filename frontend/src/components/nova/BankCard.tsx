import { cn } from "@/lib/utils";

/**
 * The glossy NovaBank card face. The metallic art behind it is a CSS "brushed
 * silk" shape — drop your own render into the marked image slot to replace it.
 */
export function BankCard({ className, holderName }: { className?: string; holderName?: string }) {
  return (
    <div className={cn("relative mx-auto w-full max-w-[38rem]", className)}>
      {/* blurred abstract art behind the card */}
      <div
        aria-hidden="true"
        className="nova-silk pointer-events-none absolute -inset-x-16 -top-24 bottom-6 -z-10 rounded-[50%] opacity-80"
      />

      <div className="nova-plate nova-grain relative aspect-[1.62/1] overflow-hidden rounded-[1.75rem] sm:rounded-[2.25rem]">
        {/* IMAGE SLOT — drop your card render here (1600×990, transparent PNG) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover opacity-0"
          data-slot="bank-card-render"
        />

        <div className="relative z-[2] flex h-full flex-col justify-between p-6 sm:p-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-5 text-ink" aria-hidden="true">
                <path d="M3 12.4 19.5 4 12.8 12l6.7 8L3 11.6" fill="currentColor" />
              </svg>
              <span className="text-lg font-extrabold tracking-[0.18em] text-ink sm:text-2xl">
                NOVABANK
              </span>
            </div>
            {/* contactless */}
            <svg viewBox="0 0 24 24" className="size-6 text-ink/70 sm:size-7" aria-hidden="true">
              {[5, 9, 13].map((r, i) => (
                <path
                  key={r}
                  d={`M${5 + i * 4} 6a10 10 0 0 1 0 12`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ))}
            </svg>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="space-y-3">
              {/* chip */}
              <div className="grid h-9 w-12 grid-cols-3 gap-[3px] rounded-md bg-ink/12 p-1.5 sm:h-10 sm:w-14">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="rounded-[2px] bg-ink/20" />
                ))}
              </div>
              <p className="tnum font-mono text-[0.8125rem] tracking-[0.22em] text-ink/80 sm:text-base">
                •••• •••• •••• 4471
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink/55">
                Passkey secured
              </p>
              <p className="text-sm font-bold tracking-wide text-ink">
                {holderName?.toUpperCase() || "YOUR NAME"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
