import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────────────────────── */

const novaButton = cva(
  "group relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-[transform,box-shadow,background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-lime text-white shadow-[0_10px_24px_-10px_oklch(0.55_0.21_263_/_0.5)] hover:-translate-y-0.5 hover:bg-lime-deep hover:shadow-[0_18px_36px_-12px_oklch(0.5_0.21_264_/_0.55)] active:translate-y-0",
        secondary: "bg-lime-soft text-ink hover:-translate-y-0.5 hover:bg-[oklch(0.93_0.05_260)]",
        outline:
          "border border-[oklch(0.207_0.014_251_/_0.14)] bg-card text-ink hover:-translate-y-0.5 hover:border-[oklch(0.207_0.014_251_/_0.28)]",
        ghost: "text-ink/80 hover:text-ink hover:bg-muted",
        danger: "bg-destructive/10 text-destructive hover:bg-destructive/16",
        link: "text-ink underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-9 px-4 text-[0.8125rem]",
        md: "h-11 px-5 text-sm min-w-11",
        lg: "h-[3.25rem] px-7 text-[0.95rem]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface NovaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof novaButton> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: NovaButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(novaButton({ variant, size }), className)} {...props} />;
}

/* ── Pill badge ─────────────────────────────────────────────────────────── */

export function PillBadge({
  children,
  icon,
  tone = "soft",
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "soft" | "white" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium",
        tone === "soft" && "bg-lime-soft text-ink",
        tone === "white" && "border border-[oklch(0.207_0.014_251_/_0.08)] bg-card text-ink",
        tone === "ink" && "bg-ink text-lime",
        className,
      )}
    >
      {icon ? <span className="shrink-0 [&>svg]:size-3.5">{icon}</span> : null}
      {children}
    </span>
  );
}

/* ── Risk badge ─────────────────────────────────────────────────────────── */

export function RiskBadge({
  level,
  score,
  className,
}: {
  level: "low" | "medium" | "high";
  score?: number;
  className?: string;
}) {
  const copy = { low: "Low", medium: "Medium", high: "High" }[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.1em]",
        level === "low" && "border-success/25 bg-success/10 text-primary",
        level === "medium" && "border-warning/30 bg-warning/12 text-[oklch(0.58_0.13_70)]",
        level === "high" && "border-destructive/25 bg-destructive/10 text-destructive",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          level === "low" && "bg-success",
          level === "medium" && "bg-warning",
          level === "high" && "bg-destructive",
        )}
      />
      {copy}
      {score !== undefined ? <span className="opacity-60">· {score}</span> : null}
    </span>
  );
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card sm:p-8",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  description,
  index,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  index?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)] bg-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift sm:p-7",
        className,
      )}
    >
      {index ? (
        <span className="absolute right-6 top-6 font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground/60">
          {index}
        </span>
      ) : null}
      <span className="grid size-11 place-items-center rounded-2xl bg-lime-soft text-ink transition-colors duration-300 group-hover:bg-lime [&>svg]:size-5">
        {icon}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-base font-bold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function StatCard({
  value,
  label,
  footnote,
  className,
}: {
  value: string;
  label: string;
  footnote?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="tnum text-4xl font-bold leading-none sm:text-5xl">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {footnote ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}

/* ── Section heading ────────────────────────────────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn("max-w-2xl space-y-3", align === "center" && "mx-auto text-center", className)}
    >
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="text-[1.75rem] leading-[1.1] sm:text-4xl">{title}</h2>
      {sub ? <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-14 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-2xl bg-lime-soft text-ink [&>svg]:size-6">
        {icon}
      </span>
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

/* ── Hairline detail: a small monospace key/value line ──────────────────── */

export function MetaLine({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2.5", className)}>
      <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className="tnum text-sm font-medium">{value}</span>
    </div>
  );
}
