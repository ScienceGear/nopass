import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Car,
  CircleSlash2,
  Fingerprint,
  KeyRound,
  Plug,
  Receipt,
  RefreshCcw,
  ShoppingBag,
  Coffee,
  ShieldAlert,
} from "lucide-react";
import type { ActivityEvent, Transaction } from "@/lib/api";
import { formatINR } from "@/lib/api";
import { DeviceIconTile } from "@/components/nova/DeviceIcon";
import { formatActivityIp, formatLocation } from "@/lib/device";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./primitives";

const categoryIcon: Record<Transaction["category"], React.ElementType> = {
  salary: Banknote,
  transfer: ArrowUpRight,
  food: Coffee,
  transport: Car,
  shopping: ShoppingBag,
  utilities: Plug,
  subscription: Receipt,
  refund: RefreshCcw,
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const fullTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TransactionRow({ txn }: { txn: Transaction }) {
  const Icon = txn.status === "declined" ? CircleSlash2 : categoryIcon[txn.category];
  const credit = txn.amountMinor > 0;

  return (
    <div className="group flex items-center gap-3 py-4 sm:gap-4">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-200 [&>svg]:size-[1.05rem]",
          txn.status === "declined"
            ? "bg-destructive/10 text-destructive"
            : credit
              ? "bg-success/12 text-primary"
              : "bg-muted text-ink/70 group-hover:bg-lime-soft",
        )}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{txn.merchant}</p>
        <p className="truncate font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
          {shortDate(txn.date)} · {txn.method}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            "tnum text-sm font-semibold",
            credit && "text-primary",
            txn.status === "declined" && "text-muted-foreground line-through",
          )}
        >
          {formatINR(txn.amountMinor, { signed: true })}
        </p>
        {txn.status !== "settled" ? (
          <span
            className={cn(
              "font-mono text-[0.625rem] uppercase tracking-[0.12em]",
              txn.status === "pending" ? "text-[oklch(0.6_0.13_70)]" : "text-destructive",
            )}
          >
            {txn.status}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const activityIcon: Record<ActivityEvent["type"], React.ElementType> = {
  login: Fingerprint,
  transfer: ArrowDownLeft,
  alert: ShieldAlert,
  passkey: KeyRound,
};

export function ActivityRow({
  event,
  selected,
  onSelect,
  onRevoke,
  revoking,
}: {
  event: ActivityEvent;
  selected?: boolean;
  onSelect?: () => void;
  onRevoke?: () => void;
  revoking?: boolean;
}) {
  const FallbackIcon = activityIcon[event.type];
  const showDeviceIcon = event.type !== "transfer" && event.type !== "alert";
  const locationLabel = formatLocation(event.city, event.country);
  const listIp = formatActivityIp(event.ipAddress, event.ipMasked, "list");

  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-4 transition-colors duration-200 sm:flex-row sm:items-center sm:gap-4",
        selected && "bg-lime-soft/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            showDeviceIcon
              ? "border border-[oklch(0.207_0.014_251_/_0.08)] bg-card text-ink/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
              : cn(
                  "[&>svg]:size-[1.05rem]",
                  event.risk === "high"
                    ? "bg-destructive/10 text-destructive"
                    : event.risk === "medium"
                      ? "bg-warning/14 text-[oklch(0.58_0.13_70)]"
                      : "bg-muted text-ink/70",
                ),
          )}
        >
          {showDeviceIcon ? <DeviceIconTile kind={event.deviceIcon} /> : <FallbackIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {event.deviceLabel}
            {event.isCurrent ? (
              <span className="ml-2 inline-block rounded-full bg-lime-soft px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-ink">
                This device
              </span>
            ) : null}
            <span className="font-normal text-muted-foreground"> · {locationLabel}</span>
          </p>
          <p className="truncate font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
            {fullTime(event.timestamp)} · IP {listIp}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2 pl-13 sm:pl-0">
        <RiskBadge level={event.risk} />
        {event.sessionActive && event.sessionId ? (
          <button
            type="button"
            onClick={onRevoke}
            disabled={revoking}
            className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-50"
          >
            {revoking ? "Revoking…" : "Revoke"}
          </button>
        ) : (
          <span className="hidden font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
            ended
          </span>
        )}
      </div>
    </div>
  );
}
