import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { support } from "@/lib/config";
import { Button } from "./primitives";
import { useSession, clearSession } from "@/lib/session";

/* ── Logo ───────────────────────────────────────────────────────────────── */

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("group inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-5 text-ink" aria-hidden="true">
        <path
          d="M3 12.4 19.5 4 12.8 12l6.7 8L3 11.6"
          fill="currentColor"
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        />
      </svg>
      <span className="text-[0.9375rem] font-extrabold tracking-[0.14em] text-ink">NOVABANK</span>
    </Link>
  );
}

/* ── Page background + white panel shell ────────────────────────────────── */

export function NovaBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="nova-field nova-grain min-h-screen px-0 py-0 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
      {children}
    </div>
  );
}

export function PageShell({
  children,
  className,
  bare = false,
}: {
  children: React.ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative z-[2] mx-auto w-full max-w-[1400px] overflow-hidden bg-card sm:rounded-[2.25rem] sm:shadow-panel",
        !bare && "px-5 pb-16 pt-4 sm:px-8 lg:px-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Scroll reveal ──────────────────────────────────────────────────────── */

export function Reveal({
  children,
  delay = 0,
  className,
  as: As = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "-40px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return React.createElement(
    As,
    {
      ref: ref as never,
      className: cn("reveal", className),
      "data-shown": shown,
      style: { transitionDelay: `${delay}ms` },
    },
    children,
  );
}

/* ── Navbar ─────────────────────────────────────────────────────────────── */

const marketingLinks = [
  { to: "/accounts", label: "Accounts" },
  { to: "/security", label: "Security" },
  { to: "/about", label: "About" },
  { to: "/pricing", label: "Pricing" },
] as const;

const appLinks = [
  { to: "/dashboard", label: "Overview" },
  { to: "/transfer", label: "Transfer" },
  { to: "/activity", label: "Activity" },
  { to: "/settings/security", label: "Security" },
] as const;

export function Navbar({ variant = "marketing" }: { variant?: "marketing" | "app" }) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { session } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = variant === "app" ? appLinks : marketingLinks;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 -mx-5 flex items-center gap-3 px-5 py-3.5 transition-all duration-300 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12",
          scrolled
            ? "border-b border-[oklch(0.207_0.014_251_/_0.07)] bg-card/85 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-full px-3 py-2 text-sm font-medium text-ink/70 transition-colors duration-200 hover:bg-muted hover:text-ink data-[status=active]:bg-lime-soft data-[status=active]:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          {session ? (
            <>
              <span className="eyebrow pr-1">{session.name.split(" ")[0]}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearSession();
                  window.location.assign("/");
                }}
              >
                Log out
              </Button>
              <Button size="sm" asChild>
                <Link to="/dashboard">
                  Dashboard <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/signup">Open account</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-ink lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col bg-card px-5 pb-8 pt-4 transition-[opacity,transform] duration-300 lg:hidden",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0",
        )}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="grid size-11 place-items-center rounded-full bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="mt-10 flex flex-col">
          {links.map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center justify-between border-b border-[oklch(0.207_0.014_251_/_0.07)] py-5 text-2xl font-bold tracking-[-0.02em]"
            >
              {l.label}
              <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground">
                0{i + 1}
              </span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-8">
          <Button className="w-full" size="lg" asChild>
            <Link to={session ? "/dashboard" : "/signup"}>
              {session ? "Go to dashboard" : "Open account"}
            </Link>
          </Button>
          {!session ? (
            <Button className="w-full" size="lg" variant="outline" asChild>
              <Link to="/login">Log in with a passkey</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

const footerCols = [
  {
    title: "Product",
    links: [
      { to: "/accounts", label: "Accounts" },
      { to: "/transfer", label: "Transfers" },
      { to: "/activity", label: "Activity" },
      { to: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Security",
    links: [
      { to: "/security", label: "How it works" },
      { to: "/activity", label: "Login history" },
      { to: "/settings/security", label: "Your passkeys" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
      { to: "/security", label: "Security" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-20 border-t border-[oklch(0.207_0.014_251_/_0.07)] pt-12">
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {footerCols.map((col) => (
          <div key={col.title} className="min-w-0">
            <p className="eyebrow">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={col.title + l.label}>
                  <Link
                    to={l.to}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-col gap-4 border-t border-[oklch(0.207_0.014_251_/_0.07)] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <div className="flex flex-col gap-1 text-center sm:flex-row sm:items-center sm:gap-4">
          <Link
            to="/contact"
            className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground transition-colors hover:text-ink"
          >
            {support.phone} · {support.email}
          </Link>
          <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground">
            © {new Date().getFullYear()} NovaBank · Demo product, not a licensed bank
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          {[
            { to: "/about", label: "X" },
            { to: "/about", label: "IN" },
            { to: "/about", label: "GH" },
          ].map((s) => (
            <Link
              key={s.label}
              to={s.to}
              aria-label={`NovaBank on ${s.label}`}
              className="grid size-8 place-items-center rounded-full bg-muted font-mono text-[0.625rem] tracking-wider text-muted-foreground transition-colors duration-200 hover:bg-lime-soft hover:text-ink"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
