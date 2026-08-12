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
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true" fill="none" stroke="#0078D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L4 9l2 8 6 5 6-5 2-8-8-7z" fill="#0078D412" stroke="#0078D4" strokeWidth="1.5" />
          <path d="M12 2v20" stroke="#0078D4" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M4 9h16" stroke="#0078D4" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M12 7L7 11h10L12 7z" fill="#0078D420" stroke="#0078D4" />
          <path d="M7 11l-2 3 7 5 7-5-2-3H7z" fill="#0078D405" stroke="#0078D4" />
          <circle cx="10" cy="10" r="0.75" fill="#0078D4" />
          <circle cx="14" cy="10" r="0.75" fill="#0078D4" />
        </svg>
      );
    case "android":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true" fill="none" stroke="#3DDC84" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L4 9l2 8 6 5 6-5 2-8-8-7z" fill="#3DDC8412" stroke="#3DDC84" strokeWidth="1.5" />
          <path d="M12 2v20" stroke="#3DDC84" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M4 9h16" stroke="#3DDC84" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M12 7L7 11h10L12 7z" fill="#3DDC8420" stroke="#3DDC84" />
          <path d="M7 11l-2 3 7 5 7-5-2-3H7z" fill="#3DDC8405" stroke="#3DDC84" />
          <circle cx="10" cy="10" r="0.75" fill="#3DDC84" />
          <circle cx="14" cy="10" r="0.75" fill="#3DDC84" />
        </svg>
      );
    case "ios":
    case "macos":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <path
            fill="#8E8E93"
            d="M16.8 12.4c.02 2.3 2 3.05 2.03 3.06-.02.06-.32 1.08-1.05 2.14-.63.92-1.28 1.84-2.31 1.86-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-.98-2.4-1.9-1.3-1.88-2.3-5.3-.98-7.62.66-1.15 1.84-1.88 3.12-1.9 1.02-.02 1.98.68 2.5.68.52 0 1.68-.84 2.83-.72.48.02 1.83.19 2.7 1.44-.07.04-1.61.94-1.59 2.8ZM14.3 4.6c.56-.68.94-1.62.84-2.56-.81.03-1.78.54-2.36 1.22-.52.6-.97 1.57-.85 2.5.9.07 1.82-.46 2.37-1.16Z"
          />
        </svg>
      );
    case "safari":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#00A2E8" />
          <path fill="#fff" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8Z" />
          <path fill="#FF3B30" d="M16 8l-3 4-4 3 3-4 4-3Z" />
          <path fill="#157DEC" d="M8 16l4-3 3-4-3 4-4 3Z" />
        </svg>
      );
    case "linux":
      return (
        <svg viewBox="0 0 24 24" className={glyph} aria-hidden="true" fill="none" stroke="#FFD200" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L4 9l2 8 6 5 6-5 2-8-8-7z" fill="#FFD20012" stroke="#FFD200" strokeWidth="1.5" />
          <path d="M12 2v20" stroke="#FFD200" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M4 9h16" stroke="#FFD200" strokeWidth="0.75" strokeDasharray="2 2" />
          <path d="M12 7L7 11h10L12 7z" fill="#FFD20020" stroke="#FFD200" />
          <path d="M7 11l-2 3 7 5 7-5-2-3H7z" fill="#FFD20005" stroke="#FFD200" />
          <circle cx="10" cy="10" r="0.75" fill="#FFD200" />
          <circle cx="14" cy="10" r="0.75" fill="#FFD200" />
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
