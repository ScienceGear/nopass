import { Sparkles } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { PillBadge } from "./primitives";
import { Logo } from "./shell";

export interface AuthTip {
  icon: React.ReactNode;
  title: string;
  body: string;
}

/**
 * Split-sign-in shell: a branded navy panel on the left (headline + tips) and
 * the form on the right. Uses a single document scroll  no inner scrollbars.
 * The left panel is a normal grid cell that stretches to match the row, so both
 * halves scroll together on every screen. On small screens it becomes a top
 * strip and the whole page scrolls as one.
 */
export function AuthSplit({
  eyebrow,
  headline,
  subline,
  tips = [],
  badge,
  children,
  className,
}: {
  eyebrow?: string;
  headline: string;
  subline?: string;
  tips?: AuthTip[];
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative grid h-full w-full overflow-hidden bg-card lg:grid-cols-[1fr_1.12fr] lg:rounded-[2.25rem] lg:shadow-panel",
        className,
      )}
    >
      {/* ── Left: brand panel (stretched to match the row) ───────────── */}
      <aside className="nova-grain relative hidden overflow-hidden bg-[linear-gradient(165deg,oklch(0.23_0.035_253),oklch(0.27_0.06_258)_55%,oklch(0.19_0.055_268))] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden="true"
          className="nova-silk pointer-events-none absolute -right-28 -top-28 size-[30rem] opacity-60"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-44 -left-28 size-[32rem] rounded-full bg-lime/20 blur-[100px]"
        />

        <div className="relative z-10">
          <Logo tone="light" />
        </div>

        <div className="relative z-10 my-6 space-y-8">
          <div className="max-w-md space-y-4">
            {eyebrow ? (
              <PillBadge tone="ink" icon={<Sparkles className="size-3.5" />}>
                {eyebrow}
              </PillBadge>
            ) : null}
            <h1 className="text-[2rem] font-extrabold leading-[1.08] tracking-[-0.03em] xl:text-[2.5rem]">
              {headline}
            </h1>
            {subline ? (
              <p className="max-w-sm text-[0.95rem] leading-relaxed text-white/65">{subline}</p>
            ) : null}
          </div>

          {tips.length ? (
            <ul className="space-y-4">
              {tips.map((tip) => (
                <li key={tip.title} className="flex items-start gap-4">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-lime ring-1 ring-white/15 [&>svg]:size-[1.125rem]">
                    {tip.icon}
                  </span>
                  <span>
                    <span className="block text-[0.9375rem] font-semibold">{tip.title}</span>
                    <span className="block text-sm leading-relaxed text-white/60">{tip.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="relative z-10 flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/45">
          <span className="size-1.5 rounded-full bg-lime" /> Demo product — not a real bank
        </p>
      </aside>

      {/* ── Right: form panel ─────────────────────────────────────────── */}
      <section className="relative flex min-h-0 flex-col bg-card">
        {/* Mobile-only brand strip */}
        <div className="space-y-2 border-b border-hairline bg-lime-soft/60 px-5 pb-4 pt-5 lg:hidden">
          <PillBadge tone="ink" icon={<Sparkles className="size-3.5" />}>
            {eyebrow ?? "NovaBank"}
          </PillBadge>
          <h1 className="text-lg font-extrabold leading-tight">{headline}</h1>
          {tips[0] ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-card text-ink ring-1 ring-hairline [&>svg]:size-3.5">
                {tips[0].icon}
              </span>
              <span className="font-medium text-ink">{tips[0].title}</span>
            </p>
          ) : null}
        </div>

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-10 lg:px-12">
          <Logo className="lg:hidden" />
          <div className="ml-auto flex items-center">{badge}</div>
        </header>

        <main className="flex min-h-0 w-full flex-1 items-center justify-center overflow-y-auto px-5 pb-8 pt-2 sm:px-10 lg:px-12">
          {children}
        </main>
      </section>
    </div>
  );
}
