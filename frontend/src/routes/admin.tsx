import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, Users, MonitorSmartphone, Ban } from "lucide-react";
import { EmptyState, Panel, RiskBadge } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { RiskMap, type RiskPoint } from "@/components/nova/RiskMap";
import { AdminRecoverPanel } from "@/components/nova/AdminRecover";
import { getAdminSecurityOverview } from "@/lib/api";

const stats = [
  { Icon: Users, label: "Users", key: "users" },
  { Icon: MonitorSmartphone, label: "Active sessions", key: "activeSessions" },
  { Icon: ShieldAlert, label: "Risk events", key: "riskyEvents" },
  { Icon: Ban, label: "Blocked", key: "blockedEvents" },
] as const;

const POLL_INTERVAL_MS = 30_000;

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const overview = useQuery({
    queryKey: ["admin-security"],
    queryFn: getAdminSecurityOverview,
    refetchInterval: POLL_INTERVAL_MS,
  });
  const totals = overview.data?.totals;
  const points: RiskPoint[] =
    overview.data?.events
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))
      .map((e) => ({
        id: e.id,
        lat: e.lat!,
        lon: e.lon!,
        riskScore: e.riskScore,
        riskAction: e.riskAction,
        user: e.user.name,
        location: e.location,
        at: e.at,
      })) ?? [];

  const lastUpdated = overview.dataUpdatedAt;
  const fresh = lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : 0;

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />
          <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
            <div>
              <p className="eyebrow">Bank authority</p>
              <h1 className="pt-1 text-[1.75rem] sm:text-4xl">Security operations</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Live risk decisions from the last 30 days. Refreshes every 30s. Access is enforced
                by the API.
              </p>
            </div>
            <span className="flex items-center gap-2 rounded-full border border-hairline bg-card px-3 py-1.5 text-xs text-muted-foreground">
              <RefreshCw
                className={`size-3.5 ${overview.isFetching ? "animate-spin text-lime" : ""}`}
              />
              Updated {fresh <= 2 ? "just now" : `${fresh}s ago`}
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(({ Icon, label, key }) => (
              <Panel key={label}>
                <div className="flex items-center gap-3">
                  <Icon className="size-5" />
                  <div>
                    <p className="eyebrow">{label}</p>
                    <p className="tnum text-2xl font-bold">{totals?.[key] ?? ""}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl">
            <RiskMap points={points} />
          </div>

          <div className="mt-4">
            <AdminRecoverPanel />
          </div>

          <Panel className="mt-4">
            <h2 className="text-lg">Suspicious activity</h2>
            <div className="mt-3 divide-y">
              {overview.data?.events.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-2 py-4 text-sm md:grid-cols-[1.2fr_1.5fr_auto]"
                >
                  <div>
                    <p className="font-semibold">{event.user.name}</p>
                    <p className="text-muted-foreground">{event.user.email}</p>
                  </div>
                  <div>
                    <p>{event.device}</p>
                    <p className="text-muted-foreground">
                      {event.location || "Location unavailable"} · {event.ipAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge
                      level={event.riskScore > 60 ? "high" : "medium"}
                      score={event.riskScore}
                    />
                    <span className="capitalize text-muted-foreground">
                      {event.riskAction.replace("_", " ")}
                    </span>
                  </div>
                </div>
              )) ?? null}
              {!overview.isPending && !overview.data?.events.length ? (
                <EmptyState
                  icon={<ShieldAlert />}
                  title="No suspicious activity"
                  description="Risk events will appear here when the engine requests step-up, image verification, or blocks an attempt."
                />
              ) : null}
            </div>
          </Panel>
          <Footer />
        </PageShell>
      </NovaBackground>
    </RequireAuth>
  );
}
