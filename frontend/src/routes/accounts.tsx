import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CreditCard, Plus } from "lucide-react";
import { Button, EmptyState, Panel, PillBadge } from "@/components/nova/primitives";
import { BalanceSkeleton } from "@/components/nova/skeletons";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { getAccountSummary } from "@/lib/api";
import { formatINR } from "@/lib/api";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts & cards  NovaBank" },
      {
        name: "description",
        content: "Your Everyday account and any cards attached to it.",
      },
      { property: "og:title", content: "Accounts & cards" },
      { property: "og:description", content: "Balance, cards and account details." },
    ],
  }),
  component: Accounts,
});

function Accounts() {
  const account = useQuery({ queryKey: ["account"], queryFn: getAccountSummary });

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />

          <div className="pt-8">
            <p className="eyebrow">Accounts</p>
            <h1 className="pt-1 text-[1.75rem] sm:text-4xl">Accounts & cards</h1>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <Panel className="relative overflow-hidden">
                <div
                  aria-hidden="true"
                  className="nova-silk absolute -right-24 -top-28 size-64 rounded-full opacity-30"
                />
                {account.isPending ? (
                  <BalanceSkeleton />
                ) : account.data ? (
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="eyebrow">
                          {account.data.nickname} · {account.data.maskedNumber}
                        </p>
                        <p className="tnum pt-2 text-[2rem] font-bold leading-none sm:text-4xl">
                          {formatINR(account.data.balanceMinor)}
                        </p>
                      </div>
                      <PillBadge tone="soft">Everyday</PillBadge>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link to="/transfer">
                          Send <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/activity">History</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Panel>
            </Reveal>

            <Reveal delay={100}>
              <Panel>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">Cards</h2>
                  <Button size="sm" variant="outline">
                    <Plus className="size-4" /> Add card
                  </Button>
                </div>
                <div className="mt-3 hairline-y">
                  <EmptyState
                    icon={<CreditCard />}
                    title="No cards yet"
                    description="Cards arrive with your account in the next milestone  transfers work today."
                  />
                </div>
              </Panel>
            </Reveal>
          </div>

          <Footer />
        </PageShell>
      </NovaBackground>
    </RequireAuth>
  );
}
