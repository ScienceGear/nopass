import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { LogOut, MapPin, ShieldAlert } from "lucide-react";
import { Button, EmptyState, MetaLine, Panel, RiskBadge } from "@/components/nova/primitives";
import { ActivityRow } from "@/components/nova/rows";
import { ListSkeleton } from "@/components/nova/skeletons";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getActivity, postRevokeAllSessions, postRevokeSession } from "@/lib/api";
import { formatActivityIp, formatLocation } from "@/lib/device";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Login & security history  NovaBank" },
      {
        name: "description",
        content:
          "Every sign-in, transfer and blocked attempt on your account, with the signal that scored it.",
      },
      { property: "og:title", content: "Login & security history" },
      {
        property: "og:description",
        content: "Full session history with risk scores and one-tap revoke.",
      },
    ],
  }),
  component: Activity,
});

const filters = ["All", "Logins", "Transfers", "Alerts"] as const;

function Activity() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["activity"], queryFn: getActivity });
  const [filter, setFilter] = React.useState<(typeof filters)[number]>("All");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [confirmAll, setConfirmAll] = React.useState(false);

  const events = (data ?? []).filter((e) =>
    filter === "All"
      ? true
      : filter === "Logins"
        ? e.type === "login"
        : filter === "Transfers"
          ? e.type === "transfer"
          : e.type === "alert",
  );
  const active = events.find((e) => e.id === selected) ?? events[0];

  async function revoke(sessionId: string, eventId: string) {
    setRevoking(eventId);
    try {
      await postRevokeSession(sessionId);
      toast.success("Session revoked", { description: "That device must sign in again." });
      qc.invalidateQueries({ queryKey: ["activity"] });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pt-8 sm:flex sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">Security</p>
              <h1 className="truncate pt-1 text-[1.75rem] sm:text-4xl">Activity</h1>
            </div>
            <Button variant="danger" onClick={() => setConfirmAll(true)}>
              <LogOut className="size-4" /> Log out of all devices
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "h-9 rounded-full px-4 text-[0.8125rem] font-medium transition-colors duration-200",
                  filter === f ? "bg-ink text-lime" : "bg-muted text-ink/70 hover:bg-lime-soft",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <Reveal>
              <Panel>
                <div className="hairline-y">
                  {isPending ? (
                    <ListSkeleton rows={5} />
                  ) : events.length > 0 ? (
                    events.map((e) => (
                      <ActivityRow
                        key={e.id}
                        event={e}
                        selected={active?.id === e.id}
                        onSelect={() => setSelected(e.id)}
                        onRevoke={() => e.sessionId && revoke(e.sessionId, e.id)}
                        revoking={revoking === e.id}
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon={<ShieldAlert />}
                      title="Nothing in this filter"
                      description="Try another filter  your account history is otherwise complete."
                    />
                  )}
                </div>
              </Panel>
            </Reveal>

            <Reveal delay={100}>
              <Panel className="lg:sticky lg:top-24">
                <p className="eyebrow">Selected event</p>
                {active ? (
                  <>
                    {/* MAP SLOT  drop a static map render here (720×420) */}
                    <div className="mt-4 grid h-40 place-items-center overflow-hidden rounded-2xl bg-lime-soft">
                      <div
                        aria-hidden="true"
                        className="size-full object-cover opacity-0"
                        data-slot="activity-map"
                      />
                      <span className="-mt-40 flex items-center gap-2 text-sm font-medium">
                        <MapPin className="size-4" />{" "}
                        {formatLocation(active.city, active.country)}
                      </span>
                    </div>
                    <div className="mt-4 hairline-y">
                      <MetaLine label="Device" value={active.deviceLabel} />
                      <MetaLine
                        label="IP"
                        value={
                          <span className="font-mono text-xs">
                            {formatActivityIp(active.ipAddress, active.ipMasked, "detail")}
                          </span>
                        }
                      />
                      <MetaLine label="Risk" value={<RiskBadge level={active.risk} />} />
                      <MetaLine
                        label="Session"
                        value={active.isCurrent ? "This session · Active" : active.sessionActive ? "Active" : "Ended"}
                      />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {active.signal}
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Select an event to see detail.
                  </p>
                )}
              </Panel>
            </Reveal>
          </div>

          <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Log out of all devices?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every active session ends immediately, including this one. Your passkeys stay
                  registered, so signing back in takes one tap.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full"
                  onClick={async () => {
                    const res = await postRevokeAllSessions();
                    toast.success(`${res.revoked} sessions ended`);
                    qc.invalidateQueries({ queryKey: ["activity"] });
                  }}
                >
                  Log out everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Footer />
        </PageShell>
      </NovaBackground>
    </RequireAuth>
  );
}
