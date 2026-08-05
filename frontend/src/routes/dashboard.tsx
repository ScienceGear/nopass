import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  FileText,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkle,
} from "lucide-react";
import {
  Button,
  EmptyState,
  MetaLine,
  Panel,
  PillBadge,
  RiskBadge,
} from "@/components/nova/primitives";
import { TransactionRow } from "@/components/nova/rows";
import { BalanceSkeleton, ListSkeleton } from "@/components/nova/skeletons";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { getAccountSummary, getTransactions, getActivity } from "@/lib/api";
import { formatINR } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your NovaBank account" },
      {
        name: "description",
        content:
          "Balance, recent transactions and a live security snapshot of every session on your account.",
      },
      { property: "og:title", content: "Your NovaBank account" },
      {
        property: "og:description",
        content: "Balance, transactions and session security in one view.",
      },
    ],
  }),
  component: Dashboard,
});

const quickActions = [
  { icon: ArrowUpRight, label: "Send", to: "/transfer" as const },
  { icon: ArrowDownLeft, label: "Request", to: "/transfer" as const },
  { icon: CreditCard, label: "Cards", to: "/accounts" as const },
  { icon: FileText, label: "Statements", to: "/activity" as const },
];

function Dashboard() {
  const account = useQuery({ queryKey: ["account"], queryFn: getAccountSummary });
  const txns = useQuery({ queryKey: ["transactions"], queryFn: getTransactions });
  const activity = useQuery({ queryKey: ["activity"], queryFn: getActivity });
  const lastLogin = activity.data?.find((e) => e.type === "login");

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pt-8 sm:flex sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">Wednesday, 5 August</p>
              <h1 className="truncate pt-1 text-[1.75rem] sm:text-4xl">Good morning, Rohan</h1>
            </div>
            <Button asChild>
              <Link to="/transfer">
                <Sparkle className="size-4" /> New transfer
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            {/* ── Balance + actions ─────────────────────────────── */}
            <div className="space-y-4">
              <Reveal>
                <Panel className="relative overflow-hidden">
                  <div
                    aria-hidden="true"
                    className="nova-silk absolute -right-24 -top-28 size-64 rounded-full opacity-30"
                  />
                  {account.isPending ? (
                    <BalanceSkeleton />
                  ) : account.data ? (
                    <div className="relative space-y-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="eyebrow">
                            {account.data.nickname} · {account.data.maskedNumber}
                          </p>
                          <p className="tnum pt-2 text-[2.25rem] font-bold leading-none sm:text-5xl">
                            {formatINR(account.data.balanceMinor)}
                          </p>
                        </div>
                        <PillBadge tone="soft">
                          +{formatINR(account.data.monthChangeMinor)} this month
                        </PillBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatINR(account.data.availableMinor)} available ·{" "}
                        {formatINR(account.data.balanceMinor - account.data.availableMinor)} held
                        for pending items
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {quickActions.map((a) => (
                          <Link
                            key={a.label}
                            to={a.to}
                            className="group flex min-h-[5rem] flex-col items-start justify-between rounded-2xl bg-muted p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-lime-soft"
                          >
                            <a.icon className="size-[1.15rem]" />
                            <span className="text-sm font-semibold">{a.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Panel>
              </Reveal>

              <Reveal delay={80}>
                <Panel>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg">Recent transactions</h2>
                    <Link
                      to="/activity"
                      className="text-sm font-medium text-muted-foreground transition-colors hover:text-ink"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="mt-2 hairline-y">
                    {txns.isPending ? (
                      <ListSkeleton rows={6} />
                    ) : txns.data && txns.data.items.length > 0 ? (
                      txns.data.items.map((t) => <TransactionRow key={t.id} txn={t} />)
                    ) : (
                      <EmptyState
                        icon={<ArrowUpRight />}
                        title="No transactions yet"
                        description="Once money moves in or out, every line lands here with the device that approved it."
                      />
                    )}
                  </div>
                </Panel>
              </Reveal>
            </div>

            {/* ── Security snapshot ─────────────────────────────── */}
            <Reveal delay={140}>
              <Panel className="lg:sticky lg:top-24">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-lime-soft">
                    <ShieldCheck className="size-[1.05rem]" />
                  </span>
                  <h2 className="text-lg">Security snapshot</h2>
                </div>

                {activity.isPending || !lastLogin ? (
                  <div className="mt-6 space-y-4">
                    <ListSkeleton rows={2} />
                  </div>
                ) : (
                  <>
                    <div className="mt-5 rounded-2xl bg-muted p-4">
                      <p className="text-sm font-semibold">Last login</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5" /> {lastLogin.city}, {lastLogin.device}
                      </p>
                      <p className="mt-1 font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground">
                        2 hours ago · IP {lastLogin.ipMasked}
                      </p>
                    </div>

                    <div className="mt-4 hairline-y">
                      <MetaLine
                        label="Session risk"
                        value={<RiskBadge level={lastLogin.risk} score={8} />}
                      />
                      <MetaLine label="Active sessions" value="3" />
                      <MetaLine label="Passkeys" value="3" />
                      <MetaLine label="Blocked this month" value="1" />
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                      {lastLogin.signal}
                    </p>

                    <div className="mt-5 space-y-2">
                      <Button variant="outline" className="w-full" asChild>
                        <Link to="/activity">View all activity</Link>
                      </Button>
                      <Button variant="ghost" className="w-full" asChild>
                        <Link to="/settings/security">
                          <Plus className="size-4" /> Add a passkey
                        </Link>
                      </Button>
                    </div>
                  </>
                )}
              </Panel>
            </Reveal>
          </div>

          <Footer />
        </PageShell>
      </NovaBackground>
    </RequireAuth>
  );
}
