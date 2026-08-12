import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  KeyRound,
  Loader2,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { Button, EmptyState, Panel, PillBadge, RiskBadge } from "@/components/nova/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteAdminUser,
  deleteAdminUserPasskeys,
  getAdminUserLookup,
  getAdminUsersList,
  postAdminRevokeUserSessions,
  postAdminSendUserResetEmail,
  type AdminUserListItem,
  type AdminUserLookup,
} from "@/lib/api";
import { toast } from "sonner";

/** Admin account-recovery & user management panel. */
export function AdminRecoverPanel() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<"lookup" | "directory">("directory");
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState<string | null>(null);
  const [searchFilter, setSearchFilter] = React.useState("");
  const [deletingUserId, setDeletingUserId] = React.useState<string | null>(null);

  const usersList = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: getAdminUsersList,
    refetchInterval: 15_000,
  });

  const lookup = useQuery({
    queryKey: ["admin-user", submitted],
    queryFn: () => getAdminUserLookup(submitted ?? ""),
    enabled: Boolean(submitted),
    retry: false,
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => postAdminRevokeUserSessions(userId),
    onSuccess: (res) => {
      toast.success("Sessions revoked", {
        description: `${res.revoked} session(s) ended for ${res.email}. They'll need to re-authenticate.`,
      });
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      qc.invalidateQueries({ queryKey: ["admin-security"] });
      if (submitted) lookup.refetch();
    },
    onError: (err) => {
      toast.error("Could not revoke sessions", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteAdminUser(userId),
    onSuccess: (res) => {
      toast.success("Account deleted", { description: `User ${res.email} was removed permanently.` });
      setDeletingUserId(null);
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      qc.invalidateQueries({ queryKey: ["admin-security"] });
      if (submitted) setSubmitted(null);
    },
    onError: (err) => {
      toast.error("Could not delete user", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    },
  });

  const deletePasskeysMutation = useMutation({
    mutationFn: (userId: string) => deleteAdminUserPasskeys(userId),
    onSuccess: (res) => {
      toast.success("Passkeys removed", { description: `Passkeys cleared for ${res.email}.` });
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      if (submitted) lookup.refetch();
    },
    onError: (err) => {
      toast.error("Could not delete passkeys", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    },
  });

  const sendResetEmailMutation = useMutation({
    mutationFn: (userId: string) => postAdminSendUserResetEmail(userId),
    onSuccess: (res) => {
      toast.success("Reset email sent", {
        description: `Verification link delivered to ${res.sentTo}.`,
      });
    },
    onError: (err) => {
      toast.error("Could not send email", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    },
  });

  const filteredUsers = React.useMemo(() => {
    if (!usersList.data?.users) return [];
    if (!searchFilter.trim()) return usersList.data.users;
    const q = searchFilter.toLowerCase();
    return usersList.data.users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [usersList.data, searchFilter]);

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users className="size-5 text-lime" /> User Directory &amp; Live Sessions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor registered accounts, inspect active IP sessions (`active: true`), manage passkeys,
            send reset emails, or delete accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === "directory" ? "primary" : "outline"}
            onClick={() => setActiveTab("directory")}
          >
            Directory ({usersList.data?.users.length ?? 0})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "lookup" ? "primary" : "outline"}
            onClick={() => setActiveTab("lookup")}
          >
            Lookup by email
          </Button>
        </div>
      </div>

      {activeTab === "directory" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search users by name or email…"
              className="h-10 max-w-sm rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Real-time directory auto-refreshes every 15s
            </p>
          </div>

          {usersList.isPending ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading real user data…
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="No users found"
              description="No registered accounts match your search filter."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-3">User</th>
                    <th className="py-3 px-3">Active Sessions</th>
                    <th className="py-3 px-3">Passkeys</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredUsers.map((user: AdminUserListItem) => (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-3">
                        <p className="font-semibold text-ink">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        {user.phone ? (
                          <p className="text-[0.6875rem] font-mono text-muted-foreground">
                            {user.phone}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              user.activeSessionsCount > 0
                                ? "bg-success/15 text-success"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Smartphone className="size-3" />
                            {user.activeSessionsCount} active (true)
                          </span>
                          {user.activeSessions.map((s) => (
                            <p key={s.id} className="text-[0.6875rem] text-muted-foreground">
                              {s.device} · <span className="font-mono text-ink/80">{s.ipAddress}</span>{" "}
                              {s.location ? `(${s.location})` : ""}
                            </p>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-mono text-xs">
                          {user.passkeysCount} passkey(s)
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        {user.emailVerified ? (
                          <PillBadge tone="soft" icon={<UserCheck className="size-3" />}>
                            Verified
                          </PillBadge>
                        ) : (
                          <PillBadge tone="white">Unverified</PillBadge>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Send verification / passkey reset email"
                            disabled={sendResetEmailMutation.isPending}
                            onClick={() => sendResetEmailMutation.mutate(user.id)}
                          >
                            <Mail className="size-3.5" /> Reset Email
                          </Button>
                          {user.passkeysCount > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-600 hover:text-amber-700"
                              title="Delete all passkeys for this user"
                              disabled={deletePasskeysMutation.isPending}
                              onClick={() => deletePasskeysMutation.mutate(user.id)}
                            >
                              <KeyRound className="size-3.5" /> Clear Keys
                            </Button>
                          ) : null}
                          {user.activeSessionsCount > 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              title="Revoke active sessions"
                              disabled={revokeMutation.isPending}
                              onClick={() => revokeMutation.mutate(user.id)}
                            >
                              <Ban className="size-3.5" /> Revoke
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="danger"
                            title="Delete user account"
                            disabled={deleteUserMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to delete ${user.name} (${user.email}) permanently?`,
                                )
                              ) {
                                deleteUserMutation.mutate(user.id);
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
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
            <Button
              type="submit"
              className="h-11 shrink-0"
              disabled={!email.trim() || lookup.isFetching}
            >
              {lookup.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Look up account
            </Button>
          </form>

          {!submitted ? (
            <EmptyState
              icon={<KeyRound />}
              title="Search to begin"
              description="Look up an account to see open sessions, passkeys, and recovery-code status."
            />
          ) : lookup.isError ? (
            <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {lookup.error instanceof Error
                ? lookup.error.message
                : "No account found for that email."}
            </p>
          ) : lookup.data ? (
            <LookupResult
              data={lookup.data}
              onRevoke={() => revokeMutation.mutate(lookup.data!.user.id)}
              onDeletePasskeys={() => deletePasskeysMutation.mutate(lookup.data!.user.id)}
              onSendResetEmail={() => sendResetEmailMutation.mutate(lookup.data!.user.id)}
              onDeleteUser={() => {
                if (
                  window.confirm(
                    `Delete user ${lookup.data!.user.name} (${lookup.data!.user.email}) permanently?`,
                  )
                ) {
                  deleteUserMutation.mutate(lookup.data!.user.id);
                }
              }}
              revoking={revokeMutation.isPending}
            />
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function LookupResult({
  data,
  onRevoke,
  onDeletePasskeys,
  onSendResetEmail,
  onDeleteUser,
  revoking,
}: {
  data: AdminUserLookup;
  onRevoke: () => void;
  onDeletePasskeys: () => void;
  onSendResetEmail: () => void;
  onDeleteUser: () => void;
  revoking: boolean;
}) {
  const openSessions = data.sessions.filter((s) => s.active);
  const blocked = data.stats.blockedLast7d;
  return (
    <div className="space-y-5 border-t border-hairline pt-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">{data.user.name}</p>
          <p className="text-sm text-muted-foreground">{data.user.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Member since {new Date(data.user.createdAt).toLocaleDateString()} · onboarding:{" "}
            {data.user.onboardingStep}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onSendResetEmail}>
            <Mail className="size-4" /> Send Reset Email
          </Button>
          {data.stats.passkeys > 0 ? (
            <Button variant="outline" size="sm" onClick={onDeletePasskeys}>
              <KeyRound className="size-4" /> Delete Passkeys
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={onRevoke}
            disabled={revoking || openSessions.length === 0}
          >
            {revoking ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
            Revoke Sessions ({openSessions.length})
          </Button>
          <Button variant="danger" size="sm" onClick={onDeleteUser}>
            <Trash2 className="size-4" /> Delete User
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          icon={<Smartphone className="size-4" />}
          label="Active sessions (true)"
          value={openSessions.length}
        />
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
        <h3 className="text-sm font-semibold">Real Sessions Log (`active: true`)</h3>
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
                      <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-success">
                        Active (true)
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                        Ended
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    IP <span className="font-mono text-ink">{s.ipAddress}</span> ·{" "}
                    {s.location || "Location unavailable"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(s.createdAt).toLocaleString()}
                </p>
                <RiskBadge
                  level={s.riskScore > 60 ? "high" : s.riskScore > 30 ? "medium" : "low"}
                  score={s.riskScore}
                />
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
      className={`flex items-center gap-3 rounded-2xl border p-3 ${
        alert
          ? "border-warning/30 bg-warning/8"
          : "border-hairline bg-muted/40"
      }`}
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
