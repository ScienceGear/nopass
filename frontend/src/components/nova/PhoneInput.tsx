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

const DEFAULT_COUNTRY: Country = COUNTRIES[0]!;

/** Split an E.164 value like "+919876543210" into dial code + national part. */
function parseValue(value: string): { country: Country; national: string } {
  const trimmed = value.replace(/\s/g, "");
  const match = trimmed.match(/^\+([0-9]+)(.*)$/);
  if (!match) return { country: DEFAULT_COUNTRY, national: trimmed };
  const dial = `+${match[1]}`;
  const country = COUNTRIES.find((c) => c.dial === dial) ?? DEFAULT_COUNTRY;
  return { country, national: country.dial === dial ? (match[2] ?? "") : trimmed };
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
    if (next.dial === country.dial) return;
    onChange(`${next.dial}${national.replace(/^\s*/, "")}`);
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
          <span aria-hidden="true" className="text-base leading-none">
            {country.flag}
          </span>
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
                <span aria-hidden="true">{c.flag}</span>
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
          const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 15);
          onChange(`${country.dial}${digits}`);
        }}
        className="h-12 w-full rounded-r-2xl border border-input bg-transparent px-3.5 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}
