import type { DeviceIconKind } from "@/lib/device";
import { cn } from "@/lib/utils";

type Props = {
  kind: DeviceIconKind;
  className?: string;
};

/** Recognizable platform/browser glyphs for Activity device rows. */
export function DeviceIcon({ kind, className }: Props) {
  const glyph = cn("size-full", className);

  switch (kind) {
    case "windows-chrome":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#4285F4" />
          <path
            fill="#fff"
            d="M12 6.5a5.5 5.5 0 0 0-4.74 8.25l3.87-6.7A2.75 2.75 0 0 1 12 6.5Z"
          />
          <path fill="#34A853" d="M7.26 14.75 12 22l5.5-9.5H12.8A3.2 3.2 0 0 1 9.6 14.1Z" />
          <path fill="#FBBC05" d="M12 6.5h5.5L12 17.5l-2.13-3.7A5.5 5.5 0 0 1 12 6.5Z" />
          <circle cx="12" cy="12" r="2.35" fill="#fff" />
          <circle cx="12" cy="12" r="1.55" fill="#4285F4" />
        </svg>
      );
    case "windows-edge":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="#0078D4"
            d="M21.5 8.2c-.3-2.4-2-4.3-4.4-4.8C15.8 2.8 14 3 12.4 3.8 10.1 2.5 7.2 2.8 5.2 4.8 2.8 7.2 2.5 11 4.2 13.8c1.2 2 3.4 3.2 5.8 3.2 1.1 0 2.2-.3 3.1-.8.8.5 1.7.8 2.7.8 2.8 0 5.2-1.8 6-4.4-2.4-.2-4.4-1.6-5.3-3.8Z"
          />
          <path fill="#36C5F0" d="M4.2 13.8c-.5 1-.7 2.1-.7 3.2 0 4.4 3.6 8 8 8 1.8 0 3.5-.6 4.9-1.7-3.5-1.2-6-4.5-6-8.3 0-.7.1-1.4.3-2.1-.6.3-1.2.6-1.8.9Z" />
        </svg>
      );
    case "windows-firefox":
    case "firefox":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#E66000" />
          <path
            fill="#FFBA66"
            d="M12 4.5c3.1 0 5.8 1.7 7.2 4.2-1.2-.4-2.5-.5-3.8-.2-1.8.4-3.3 1.5-4.2 3.1C9.8 9.8 8.5 9 7 9c-.8 0-1.5.2-2.2.5 1.1-3 4-5 7-5Z"
          />
          <path
            fill="#fff"
            opacity="0.28"
            d="M6 13.5c0 3.3 2.7 6 6 6 2.2 0 4.1-1.2 5.2-3-2.5 1-5.5.2-7-2.2-.8-1.4-1-3-.2-4.8Z"
          />
        </svg>
      );
    case "windows":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path fill="#0078D4" d="M3 5.5 10.5 4.3V12H3V5.5Zm0 13V13h7.5v7.7L3 18.5ZM11.5 11.9V4.1L21 2.5v9.4H11.5Zm0 1.2H21v9.3l-9.5-1.6V13.1Z" />
        </svg>
      );
    case "android":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="#34A853"
            d="M17.6 9.5 18.8 7.3a.4.4 0 0 0-.7-.4l-1.3 2.3a6.9 6.9 0 0 0-4.8-1.9 6.9 6.9 0 0 0-4.8 1.9L5.9 6.9a.4.4 0 0 0-.7.4l1.2 2.2A7 7 0 0 0 4 14.5v3.5a1 1 0 0 0 1 1h1.5v2.5a1.5 1.5 0 0 0 3 0v-2.5h5v2.5a1.5 1.5 0 0 0 3 0v-2.5H19a1 1 0 0 0 1-1v-3.5a7 7 0 0 0-2.4-5Z"
          />
        </svg>
      );
    case "ios":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.8 12.4c.02 2.3 2 3.05 2.03 3.06-.02.06-.32 1.08-1.05 2.14-.63.92-1.28 1.84-2.31 1.86-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-.98-2.4-1.9-1.3-1.88-2.3-5.3-.98-7.62.66-1.15 1.84-1.88 3.12-1.9 1.02-.02 1.98.68 2.5.68.52 0 1.68-.84 2.83-.72.48.02 1.83.19 2.7 1.44-.07.04-1.61.94-1.59 2.8ZM14.3 4.6c.56-.68.94-1.62.84-2.56-.81.03-1.78.54-2.36 1.22-.52.6-.97 1.57-.85 2.5.9.07 1.82-.46 2.37-1.16Z"
          />
        </svg>
      );
    case "macos":
    case "safari":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.8 12.4c.02 2.3 2 3.05 2.03 3.06-.02.06-.32 1.08-1.05 2.14-.63.92-1.28 1.84-2.31 1.86-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-.98-2.4-1.9-1.3-1.88-2.3-5.3-.98-7.62.66-1.15 1.84-1.88 3.12-1.9 1.02-.02 1.98.68 2.5.68.52 0 1.68-.84 2.83-.72.48.02 1.83.19 2.7 1.44-.07.04-1.61.94-1.59 2.8ZM14.3 4.6c.56-.68.94-1.62.84-2.56-.81.03-1.78.54-2.36 1.22-.52.6-.97 1.57-.85 2.5.9.07 1.82-.46 2.37-1.16Z"
          />
        </svg>
      );
    case "linux":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3c-3.3 0-6 2.4-6 5.4 0 1.1.4 2.1 1 2.9-.6.3-1 .9-1 1.6v1.1c0 .8.5 1.5 1.2 1.8-.2.4-.3.9-.3 1.4 0 1.7 1.3 3 3 3h.4c.3 1.2 1.3 2 2.6 2s2.3-.8 2.6-2h.4c1.7 0 3-1.3 3-3 0-.5-.1-1-.3-1.4.7-.3 1.2-1 1.2-1.8v-1.1c0-.7-.4-1.3-1-1.6.6-.8 1-1.8 1-2.9C18 5.4 15.3 3 12 3Zm-2.2 4.2c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7Zm4.4 0c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7ZM9.8 14.5c-.8.6-1.8.9-2.8.9v1.6c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-1.6c-1 0-2-.3-2.8-.9-.8.5-1.7.8-2.7.8s-1.9-.3-2.7-.8Z"
          />
        </svg>
      );
    case "chrome":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#4285F4" />
          <path fill="#fff" d="M12 6.5a5.5 5.5 0 0 0-4.74 8.25l3.87-6.7A2.75 2.75 0 0 1 12 6.5Z" />
          <path fill="#34A853" d="M7.26 14.75 12 22l5.5-9.5H12.8A3.2 3.2 0 0 1 9.6 14.1Z" />
          <path fill="#FBBC05" d="M12 6.5h5.5L12 17.5l-2.13-3.7A5.5 5.5 0 0 1 12 6.5Z" />
          <circle cx="12" cy="12" r="2.35" fill="#fff" />
          <circle cx="12" cy="12" r="1.55" fill="#4285F4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 20h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M12 17v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Sized wrapper used by activity rows — fills the tile without looking like a tiny sticker. */
export function DeviceIconTile({ kind, className }: { kind: DeviceIconKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[0.65rem]",
        className,
      )}
    >
      <DeviceIcon kind={kind} />
    </span>
  );
}
