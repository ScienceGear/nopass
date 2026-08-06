import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Users, MonitorSmartphone, Ban } from "lucide-react";
import { EmptyState, Panel, RiskBadge } from "@/components/nova/primitives";
import { Footer, Navbar, NovaBackground, PageShell } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { getAdminSecurityOverview } from "@/lib/api";

const stats = [
  { Icon: Users, label: "Users", key: "users" },
  { Icon: MonitorSmartphone, label: "Active sessions", key: "activeSessions" },
  { Icon: ShieldAlert, label: "Risk events", key: "riskyEvents" },
  { Icon: Ban, label: "Blocked", key: "blockedEvents" },
] as const;

export const Route = createFileRoute("/admin")({ component: Admin });

function Admin() {
  const overview = useQuery({ queryKey: ["admin-security"], queryFn: getAdminSecurityOverview });
  const totals = overview.data?.totals;
  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />
          <div className="pt-8">
            <p className="eyebrow">Bank authority</p>
            <h1 className="pt-1 text-[1.75rem] sm:text-4xl">Security operations</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Live risk decisions from the last 30 days. Access is enforced by the API.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(({ Icon, label, key }) => (
              <Panel key={label}>
                <div className="flex items-center gap-3">
                  <Icon className="size-5" />
                  <div>
                    <p className="eyebrow">{label}</p>
                    <p className="tnum text-2xl font-bold">{totals?.[key] ?? "—"}</p>
                  </div>
                </div>
              </Panel>
            ))}
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
