import {
  SiAndroid,
  SiApple,
  SiGooglechrome,
  SiLinux,
  SiFirefox,
  SiSafari,
} from "@icons-pack/react-simple-icons";
import type { DeviceIconKind } from "@/lib/device";
import { cn } from "@/lib/utils";

type Props = {
  kind: DeviceIconKind;
  className?: string;
};

/** Official Simple Icons brand path for Windows (simpleicons.org/icons/windows11.svg) */
function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="#0078D4"
    >
      {/* Simple Icons: windows11 */}
      <title>Windows</title>
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

/** Official Simple Icons brand path for Microsoft Edge (simpleicons.org/icons/microsoftedge.svg) */
function EdgeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="#0078D4"
    >
      <title>Microsoft Edge</title>
      <path d="M21.86 17.86c-.36.2-.74.37-1.12.51-1.1.4-2.27.6-3.49.6-4.83 0-9.05-3.3-9.05-7.57 0-2.1 1.3-3.95 3.44-3.95 2.62 0 4.24 2.56 4.24 5.2 0 1.75-.68 2.54-1.41 2.54-.41 0-.72-.25-.72-.86 0-.18.04-.41.09-.66l.61-3.33a5.8 5.8 0 0 0-.04-.6C14.41 8.65 13.2 8 11.84 8c-2.45 0-4.44 2.16-4.44 5.29 0 1.68.56 3.03 1.54 3.98-1.63.66-3.52.9-5.25.54A11.97 11.97 0 0 1 0 12C0 5.37 5.37 0 12 0s12 5.37 12 12c0 2.16-.57 4.18-1.58 5.91l-.56-.05Z" />
    </svg>
  );
}

/** Recognizable platform/browser glyphs for Activity device rows — powered by Simple Icons. */
export function DeviceIcon({ kind, className }: Props) {
  const cls = cn("size-full", className);

  switch (kind) {
    case "windows-chrome":
    case "chrome":
      return <SiGooglechrome className={cls} color="#4285F4" aria-hidden="true" />;

    case "windows-edge":
      return <EdgeIcon className={cls} />;

    case "windows-firefox":
    case "firefox":
      return <SiFirefox className={cls} color="#FF7139" aria-hidden="true" />;

    case "windows":
      return <WindowsIcon className={cls} />;

    case "android":
      return <SiAndroid className={cls} color="#3DDC84" aria-hidden="true" />;

    case "ios":
    case "macos":
      return <SiApple className={cls} color="#555555" aria-hidden="true" />;

    case "safari":
      return <SiSafari className={cls} color="#006CFF" aria-hidden="true" />;

    case "linux":
      return <SiLinux className={cls} color="#FCC624" aria-hidden="true" />;

    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} aria-hidden="true">
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
