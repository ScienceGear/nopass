import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Loader2, Search, ShieldAlert, ShieldCheck, Smartphone, KeyRound } from "lucide-react";
import { Button, EmptyState, Panel, RiskBadge } from "@/components/nova/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdminUserLookup,
  postAdminRevokeUserSessions,
  type AdminUserLookup,
} from "@/lib/api";
import { toast } from "sonner";

/** Admin account-recovery tool: look up a user by email, inspect their sessions, and force re-auth. */
export function AdminRecoverPanel() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState<string | null>(null);

  const lookup = useQuery({
    queryKey: ["admin-user", submitted],
    queryFn: () => getAdminUserLookup(submitted ?? ""),
    enabled: Boolean(submitted),
    retry: false,
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => postAdminRevokeUserSessions(userId),
    onSuccess: (res) => {
      toast.success("Sessions revoked", {
        description: `${res.revoked} session(s) ended for ${res.email}. They'll need to re-authenticate.`,
      });
      if (submitted) {
        lookup.refetch();
      }
    },
    onError: (err) => {
      toast.error("Could not revoke sessions", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    },
  });

  return (
    <Panel>
      <h2 className="flex items-center gap-2 text-lg">
        <Search className="size-4" /> Account recovery
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Find an account by email, review its live sessions and recent activity, then revoke access
        to force re-authentication.
      </p>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = email.trim().toLowerCase();
          if (!trimmed.includes("@")) {
            toast.error("Enter a valid email address.");
            return;
          }
          setSubmitted(trimmed);
        }}
      >
        <Label htmlFor="admin-lookup-email" className="sr-only">
          Account email
        </Label>
        <Input
          id="admin-lookup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="someone@email.com"
          className="h-11 flex-1 rounded-2xl"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={!email.trim() || lookup.isFetching}>
          {lookup.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Look up account
        </Button>
      </form>

      {!submitted ? (
        <div className="mt-4">
          <EmptyState
            icon={<KeyRound />}
            title="Search to begin"
            description="Look up an account to see open sessions, passkeys, and recovery-code status."
          />
        </div>
      ) : lookup.isError ? (
        <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {lookup.error instanceof Error ? lookup.error.message : "No account found for that email."}
        </p>
      ) : lookup.data ? (
        <LookupResult
          data={lookup.data}
          onRevoke={() => revoke.mutate(lookup.data!.user.id)}
          revoking={revoke.isPending}
        />
      ) : null}
    </Panel>
  );
}

function LookupResult({
  data,
  onRevoke,
  revoking,
}: {
  data: AdminUserLookup;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const openSessions = data.sessions.filter((s) => s.active);
  const blocked = data.stats.blockedLast7d;
  return (
    <div className="mt-5 space-y-5 border-t border-hairline pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{data.user.name}</p>
          <p className="text-sm text-muted-foreground">{data.user.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Member since {new Date(data.user.createdAt).toLocaleDateString()} · onboarding:{" "}
            {data.user.onboardingStep}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            onClick={onRevoke}
            disabled={revoking || openSessions.length === 0}
          >
            {revoking ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
            Revoke all sessions
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<Smartphone className="size-4" />} label="Open sessions" value={openSessions.length} />
        <Stat icon={<KeyRound className="size-4" />} label="Passkeys" value={data.stats.passkeys} />
        <Stat
          icon={<ShieldCheck className="size-4" />}
          label="Recovery codes left"
          value={data.stats.unusedRecoveryCodes}
        />
        <Stat
          icon={<ShieldAlert className="size-4" />}
          label="Blocked (7d)"
          value={blocked}
          alert={blocked > 0}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Live sessions</h3>
        {data.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions on record.</p>
        ) : (
          <div className="divide-y">
            {data.sessions.map((s) => (
              <div key={s.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1.5fr_1fr_auto]">
                <div>
                  <p className="font-medium">
                    {s.device}
                    {s.active ? (
                      <span className="ml-2 rounded-full bg-success/12 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-success">
                        Active
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground">
                    {s.location || "Location unavailable"} · {s.ipAddress}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
                <RiskBadge level={s.riskScore > 60 ? "high" : s.riskScore > 30 ? "medium" : "low"} score={s.riskScore} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-3 ${alert ? "border-warning/30 bg-warning/8" : "border-hairline bg-muted/40"}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-soft text-ink [&>svg]:size-4">
        {icon}
      </span>
      <span>
        <span className="tnum block text-lg font-bold leading-none">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
