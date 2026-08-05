import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { KeyRound, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { Button, EmptyState, MetaLine, Panel, PillBadge } from "@/components/nova/primitives";
import { ListSkeleton } from "@/components/nova/skeletons";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  deletePasskey,
  getNotificationPrefs,
  getPasskeys,
  getRecoveryCodes,
  postPasskey,
  postRegenerateRecoveryCodes,
} from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/security")({
  head: () => ({
    meta: [
      { title: "Security settings — NovaBank" },
      {
        name: "description",
        content: "Manage your passkeys, recovery codes, trusted devices and security alerts.",
      },
      { property: "og:title", content: "Security settings" },
      { property: "og:description", content: "Passkeys, recovery codes and alerts in one place." },
    ],
  }),
  component: SecuritySettings,
});

function SecuritySettings() {
  const passkeys = useQuery({ queryKey: ["passkeys"], queryFn: getPasskeys });
  const codes = useQuery({ queryKey: ["recovery"], queryFn: getRecoveryCodes });
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: getNotificationPrefs });
  const [list, setList] = React.useState<Awaited<ReturnType<typeof getPasskeys>>>([]);
  const [showCodes, setShowCodes] = React.useState(false);
  const [codeList, setCodeList] = React.useState<string[]>([]);
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    if (passkeys.data) setList(passkeys.data);
  }, [passkeys.data]);
  React.useEffect(() => {
    if (codes.data) setCodeList(codes.data.codes);
  }, [codes.data]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <NovaBackground>
      <PageShell>
        <Navbar variant="app" />

        <div className="pt-8">
          <p className="eyebrow">Settings</p>
          <h1 className="pt-1 text-[1.75rem] sm:text-4xl">Security</h1>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Passkeys */}
          <Reveal>
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg">Passkeys</h2>
                <Button
                  size="sm"
                  disabled={adding}
                  onClick={async () => {
                    setAdding(true);
                    const pk = await postPasskey({ deviceName: "New device" });
                    setList((l) => [...l, pk]);
                    setAdding(false);
                    toast.success("Passkey added");
                  }}
                >
                  <Plus className="size-4" /> {adding ? "Waiting…" : "Add a new passkey"}
                </Button>
              </div>
              <div className="mt-3 hairline-y">
                {passkeys.isPending ? (
                  <ListSkeleton rows={3} />
                ) : list.length === 0 ? (
                  <EmptyState
                    icon={<KeyRound />}
                    title="No passkeys yet"
                    description="Add one and your device becomes the key to this account."
                  />
                ) : (
                  list.map((pk) => (
                    <div key={pk.id} className="flex items-center gap-3 py-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                        <KeyRound className="size-[1.05rem]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{pk.deviceName}</p>
                        <p className="truncate font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
                          {pk.platform} · added {fmt(pk.addedAt)} · used {fmt(pk.lastUsedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          await deletePasskey(pk.id);
                          setList((l) => l.filter((x) => x.id !== pk.id));
                          toast.success("Passkey revoked");
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </Reveal>

          {/* Recovery codes */}
          <Reveal delay={80}>
            <Panel>
              <h2 className="text-lg">Recovery codes</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                One-time codes for the day you lose every device. Store them offline.
              </p>
              <div className="mt-4 hairline-y">
                <MetaLine label="Remaining" value={`${codes.data?.remaining ?? "—"} of 10`} />
                <MetaLine
                  label="Generated"
                  value={codes.data ? fmt(codes.data.lastGeneratedAt) : "—"}
                />
              </div>
              <Button variant="outline" className="mt-5 w-full" onClick={() => setShowCodes(true)}>
                View codes
              </Button>
            </Panel>
          </Reveal>

          {/* Trusted devices */}
          <Reveal delay={140}>
            <Panel>
              <h2 className="text-lg">Trusted devices</h2>
              <div className="mt-3 hairline-y">
                {["iPhone 15 · Pune", "MacBook Air · Pune", "iPad Air · Pune"].map((d) => (
                  <div key={d} className="flex items-center gap-3 py-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                      <Smartphone className="size-[1.05rem]" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{d}</p>
                    <PillBadge tone="soft">Trusted</PillBadge>
                  </div>
                ))}
              </div>
            </Panel>
          </Reveal>

          {/* Notifications */}
          <Reveal delay={200}>
            <Panel>
              <h2 className="text-lg">Alerts</h2>
              <div className="mt-3 hairline-y">
                {(prefs.data ?? []).map((p) => (
                  <div key={p.id} className="flex items-start justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{p.label}</p>
                      <p className="text-[0.8125rem] text-muted-foreground">{p.hint}</p>
                    </div>
                    <Switch defaultChecked={p.enabled} className="mt-1 shrink-0" />
                  </div>
                ))}
                {prefs.isPending ? <ListSkeleton rows={3} /> : null}
              </div>
            </Panel>
          </Reveal>
        </div>

        <Dialog open={showCodes} onOpenChange={setShowCodes}>
          <DialogContent className="rounded-3xl sm:max-w-[28rem]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" /> Your recovery codes
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-4 font-mono text-sm tracking-[0.08em]">
              {codeList.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => toast.success("PDF downloaded")}
              >
                Download as PDF
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  const res = await postRegenerateRecoveryCodes();
                  setCodeList(res.codes);
                  toast.success("New codes generated");
                }}
              >
                Regenerate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Footer />
      </PageShell>
    </NovaBackground>
  );
}
