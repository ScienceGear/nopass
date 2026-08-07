import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Country {
  code: string;
  dial: string;
  flag: string;
  label: string;
}

const COUNTRIES: Country[] = [
  { code: "IN", dial: "+91", flag: "🇮🇳", label: "India" },
  { code: "US", dial: "+1", flag: "🇺🇸", label: "United States" },
  { code: "GB", dial: "+44", flag: "🇬🇧", label: "United Kingdom" },
  { code: "AE", dial: "+971", flag: "🇦🇪", label: "United Arab Emirates" },
  { code: "SG", dial: "+65", flag: "🇸🇬", label: "Singapore" },
  { code: "AU", dial: "+61", flag: "🇦🇺", label: "Australia" },
  { code: "CA", dial: "+1", flag: "🇨🇦", label: "Canada" },
  { code: "DE", dial: "+49", flag: "🇩🇪", label: "Germany" },
  { code: "FR", dial: "+33", flag: "🇫🇷", label: "France" },
  { code: "SA", dial: "+966", flag: "🇸🇦", label: "Saudi Arabia" },
];

/** Render a country flag. Emoji flags fail on Windows, so use a CDN image with emoji fallback. */
function Flag({ code, flag, className }: { code: string; flag: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <span aria-hidden="true" className={cn("text-base leading-none", className)}>
        {flag}
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn("inline-flex", className)}>
      <img
        src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
        alt=""
        width={20}
        height={15}
        className="rounded-[2px] object-cover shadow-sm"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

const DEFAULT_COUNTRY: Country = COUNTRIES[0]!;

/** Remove a known dial code (and any stray +/spaces) from the start of a value. */
function stripDial(value: string, dial: string): string {
  const compact = value.replace(/\s/g, "");
  const dialDigits = dial.replace("+", "");
  if (compact.startsWith(dialDigits)) return compact.slice(dialDigits.length);
  if (compact.startsWith(`+${dialDigits}`)) return compact.slice(dialDigits.length + 1);
  return compact.replace(/^\+/, "");
}

/**
 * Parse an E.164-ish value like "+919876543210" into dial code + national part.
 * Matches known dial codes as a prefix (longest first) so the greedy number
 * never swallows national digits  that caused "+91 91 91" while typing.
 */
function parseValue(value: string): { country: Country; national: string } {
  const compact = value.replace(/\s/g, "");
  if (!compact.startsWith("+")) {
    return { country: DEFAULT_COUNTRY, national: compact.replace(/[^\d]/g, "") };
  }
  const digits = compact.slice(1);
  const matched = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial.replace("+", "")));
  if (matched) {
    return {
      country: matched,
      national: digits.slice(matched.dial.replace("+", "").length).replace(/[^\d]/g, ""),
    };
  }
  return { country: DEFAULT_COUNTRY, national: digits.replace(/[^\d]/g, "") };
}

/** Rebuild a full value from a country + typed national digits (dedup dial). */
function normalizeWithDial(country: Country, digits: string): string {
  const cleaned = digits.replace(/[^\d]/g, "").slice(0, 15);
  return `${country.dial}${cleaned}`;
}

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  /** Show only the national part without dial-code editing (already-verified numbers). */
  readOnlyNational?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  id,
  className,
  placeholder = "98765 43210",
  autoComplete = "tel",
  disabled,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  const { country, national } = parseValue(value);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (open && listRef.current && !listRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function selectCountry(next: Country) {
    setOpen(false);
    const national = stripDial(value, country.dial);
    if (national.trim() === "" && next.dial === country.dial) return;
    onChange(`${next.dial}${national.replace(/\s/g, "").replace(/^\+/, "")}`);
  }

  return (
    <div className={cn("flex", className)}>
      <div className="relative" ref={listRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-label="Select country code"
          className="flex h-12 items-center gap-1.5 rounded-l-2xl border border-r-0 border-input bg-transparent px-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Flag code={country.code} flag={country.flag} className="mt-0.5" />
          <span className="tnum">{country.dial}</span>
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <div
            role="listbox"
            aria-label="Country code"
            className="absolute left-0 top-full z-30 mt-1.5 max-h-64 w-60 overflow-auto rounded-2xl border border-input bg-card p-1 shadow-card"
          >
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={c.code === country.code}
                onClick={() => selectCountry(c)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  c.code === country.code && "bg-lime-soft font-semibold",
                )}
              >
                <Flag code={c.code} flag={c.flag} />
                <span className="flex-1">{c.label}</span>
                <span className="tnum text-muted-foreground">{c.dial}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={national}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(normalizeWithDial(country, digits));
        }}
        className="h-12 w-full rounded-r-2xl border border-input bg-transparent px-3.5 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
