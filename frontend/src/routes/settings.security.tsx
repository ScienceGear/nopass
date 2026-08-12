import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Check, Download, KeyRound, Loader2, MousePointerClick, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { Button, EmptyState, MetaLine, Panel, PillBadge } from "@/components/nova/primitives";
import { PhoneInput } from "@/components/nova/PhoneInput";
import { ListSkeleton } from "@/components/nova/skeletons";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deletePasskey,
  deletePccpEnrollment,
  getNotificationPrefs,
  getDevices,
  getPasskeys,
  getPccpStatus,
  getProfile,
  getRecoveryCodes,
  postPasskey,
  postPhoneOtpRequest,
  postRegenerateRecoveryCodes,
  putNotificationPrefs,
  patchProfile,
  revokeDevice,
} from "@/lib/api";
import { downloadRecoveryCodesPdf } from "@/lib/recoveryPdf";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/security")({
  head: () => ({
    meta: [
      { title: "Security settings  NovaBank" },
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
  const qc = useQueryClient();
  const passkeys = useQuery({ queryKey: ["passkeys"], queryFn: getPasskeys });
  const codes = useQuery({ queryKey: ["recovery"], queryFn: getRecoveryCodes });
  const prefs = useQuery({ queryKey: ["prefs"], queryFn: getNotificationPrefs });
  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const devices = useQuery({ queryKey: ["devices"], queryFn: getDevices });
  const pccp = useQuery({ queryKey: ["pccp-status"], queryFn: getPccpStatus });
  const [list, setList] = React.useState<Awaited<ReturnType<typeof getPasskeys>>>([]);
  const [showCodes, setShowCodes] = React.useState(false);
  const [codeList, setCodeList] = React.useState<string[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [profileBusy, setProfileBusy] = React.useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = React.useState(false);
  const [phoneOtp, setPhoneOtp] = React.useState("");
  const [phoneBusy, setPhoneBusy] = React.useState(false);
  const [phoneMsg, setPhoneMsg] = React.useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [disablingPccp, setDisablingPccp] = React.useState(false);

  const phoneChanged = Boolean(phone && profile.data && phone !== profile.data.phone);

  React.useEffect(() => {
    if (passkeys.data) setList(passkeys.data);
  }, [passkeys.data]);
  React.useEffect(() => {
    if (codes.data) setCodeList(codes.data.codes);
  }, [codes.data]);
  React.useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setPhone(profile.data.phone ?? "");
    }
  }, [profile.data]);

  async function togglePref(id: string, enabled: boolean) {
    const key =
      id === "new_device"
        ? "alertNewDevice"
        : id === "large_transfer"
          ? "alertLargeTransfer"
          : id === "blocked"
            ? "alertBlockedSignIn"
            : "alertProductUpdates";
    setSavingPrefs(true);
    try {
      await putNotificationPrefs({ [key]: enabled });
      await qc.invalidateQueries({ queryKey: ["prefs"] });
    } catch {
      toast.error("Could not save that alert preference.");
      await qc.invalidateQueries({ queryKey: ["prefs"] });
    } finally {
      setSavingPrefs(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  async function sendPhoneCode() {
    if (!phone) return;
    setPhoneBusy(true);
    setPhoneMsg(null);
    try {
      await postPhoneOtpRequest({ phone, purpose: "phone_change" });
      setPhoneOtpSent(true);
      setPhoneOtp("");
      toast.success("Code sent", { description: `We texted a 6-digit code to ${phone}.` });
    } catch (error) {
      setPhoneMsg(error instanceof Error ? error.message : "Could not send the code.");
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <RequireAuth>
      <NovaBackground>
        <PageShell>
          <Navbar variant="app" />

          <div className="pt-8">
            <p className="eyebrow">Settings</p>
            <h1 className="pt-1 text-[1.75rem] sm:text-4xl">Security</h1>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <Panel>
                <h2 className="text-lg">Profile</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep your contact details current.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (phoneChanged && !/^\d{6}$/.test(phoneOtp)) {
                      toast.error("Enter the 6-digit code we texted you before saving the new number.");
                      return;
                    }
                    setProfileBusy(true);
                    try {
                      await patchProfile({
                        name,
                        phone,
                        ...(phoneChanged ? { phoneOtp } : {}),
                      });
                      setPhoneOtp("");
                      setPhoneOtpSent(false);
                      await profile.refetch();
                      toast.success("Profile updated");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Could not update your profile.",
                      );
                    } finally {
                      setProfileBusy(false);
                    }
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-11 rounded-2xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">Mobile number</Label>
                    <PhoneInput
                      id="profile-phone"
                      value={phone}
                      onChange={(value) => {
                        setPhone(value);
                        if (value !== profile.data?.phone) {
                          setPhoneOtpSent(false);
                          setPhoneOtp("");
                        }
                      }}
                      className="rounded-2xl"
                    />
                    {phoneChanged ? (
                      <div className="space-y-2">
                        {phoneOtpSent ? (
                          <div className="flex gap-2">
                            <Input
                              autoFocus
                              inputMode="numeric"
                              maxLength={6}
                              value={phoneOtp}
                              onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                              placeholder="••••••"
                              className="tnum h-11 rounded-2xl text-center font-mono text-lg tracking-[0.4em]"
                            />
                            <button
                              type="button"
                              onClick={sendPhoneCode}
                              disabled={phoneBusy}
                              className="shrink-0 rounded-2xl border border-input px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
                            >
                              Resend
                            </button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={phoneBusy}
                            onClick={sendPhoneCode}
                          >
                            {phoneBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                            Text me a verification code
                          </Button>
                        )}
                        {phoneMsg ? (
                          <p className="text-xs text-destructive">{phoneMsg}</p>
                        ) : phoneOtpSent ? (
                          <p className="text-xs text-muted-foreground">
                            Enter the 6-digit code we just texted to the new number.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            We&apos;ll text a one-time code to the new number to confirm you own it.
                          </p>
                        )}
                      </div>
                    ) : null}
                    {profile.data?.phoneVerified && !phoneChanged ? (
                      <p className="flex items-center gap-1.5 text-xs text-success">
                        <Check className="size-3.5" /> Number verified
                      </p>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Email changes require a separate verification flow and are not changed from an
                    active session.
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    disabled={profileBusy || (phoneChanged && !/^\d{6}$/.test(phoneOtp))}
                  >
                    {profileBusy ? "Saving…" : "Save profile"}
                  </Button>
                </form>
              </Panel>
            </Reveal>
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
                      const pk = await postPasskey();
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

            {/* Click-point login (PCCP) */}
            <Reveal delay={40}>
              <Panel>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg">Click-point login</h2>
                  {pccp.data?.enrolled ? (
                    <PillBadge tone="soft" icon={<MousePointerClick className="size-3.5" />}>
                      Active
                    </PillBadge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Sign in by clicking memorable spots on your images — a passwordless backup when
                  passkeys aren&apos;t available. Suspicious timing triggers an extra passkey check.
                </p>
                <div className="mt-4 hairline-y">
                  {pccp.isPending ? (
                    <ListSkeleton rows={2} />
                  ) : (
                    <>
                      <MetaLine
                        label="Status"
                        value={pccp.data?.enrolled ? "Enrolled" : "Not set up"}
                      />
                      {pccp.data?.locked ? (
                        <MetaLine
                          label="Method lockout"
                          value={
                            pccp.data.lockedUntil
                              ? `Until ${fmt(pccp.data.lockedUntil)}`
                              : "Temporarily locked"
                          }
                        />
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button size="sm" className="flex-1" asChild>
                    <Link to="/pccp/setup">
                      {pccp.data?.enrolled ? "Re-enroll click-points" : "Set up click-points"}
                    </Link>
                  </Button>
                  {pccp.data?.enrolled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={disablingPccp}
                      onClick={async () => {
                        setDisablingPccp(true);
                        try {
                          await deletePccpEnrollment();
                          await qc.invalidateQueries({ queryKey: ["pccp-status"] });
                          toast.success("Click-point login disabled");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not disable click-point login.",
                          );
                        } finally {
                          setDisablingPccp(false);
                        }
                      }}
                    >
                      {disablingPccp ? <Loader2 className="size-4 animate-spin" /> : null}
                      Disable
                    </Button>
                  ) : null}
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
                  <MetaLine label="Remaining" value={`${codes.data?.remaining ?? ""} of 10`} />
                  <MetaLine
                    label="Generated"
                    value={codes.data ? fmt(codes.data.lastGeneratedAt) : ""}
                  />
                </div>
                <Button
                  variant="outline"
                  className="mt-5 w-full"
                  onClick={() => setShowCodes(true)}
                >
                  View codes
                </Button>
              </Panel>
            </Reveal>

            {/* Trusted devices */}
            <Reveal delay={200}>
              <Panel>
                <h2 className="text-lg">Trusted devices</h2>
                <div className="mt-3 hairline-y">
                  {devices.isPending ? (
                    <ListSkeleton rows={3} />
                  ) : devices.data?.length ? (
                    devices.data.map((device) => (
                      <div key={device.id} className="flex items-center gap-3 py-4">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                          <Smartphone className="size-[1.05rem]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">{device.deviceName}</p>
                            {device.isCurrent ? <PillBadge tone="soft">This device</PillBadge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {device.location || "Location unavailable"} · IP {device.ipMasked} · last
                            used {fmt(device.lastSeen)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            await revokeDevice(device.id);
                            await devices.refetch();
                            toast.success("Trusted device removed");
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      icon={<Smartphone />}
                      title="No trusted devices"
                      description="A device appears here after a successful sign-in."
                    />
                  )}
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
                      <Switch
                        checked={p.enabled}
                        disabled={savingPrefs}
                        onCheckedChange={(checked) => togglePref(p.id, checked)}
                        className="mt-1 shrink-0"
                      />
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
                <DialogDescription>
                  {codeList.length > 0
                    ? "Store these offline — each code works exactly once."
                    : "For security, existing codes can't be shown again. Regenerate a fresh set, then store them offline."}
                </DialogDescription>
              </DialogHeader>
              {codeList.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-4 font-mono text-sm tracking-[0.08em]">
                  {codeList.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-ink">Old codes stay hidden</p>
                  <p className="mt-1 leading-relaxed">
                    Codes are only revealed the moment they&apos;re generated, then hashed and stored
                    so even we can&apos;t read them back. If you need a printable copy, regenerate a
                    fresh set below — your old codes are immediately invalidated.
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={codeList.length === 0}
                  onClick={() =>
                    downloadRecoveryCodesPdf(codeList, profile.data?.email ?? "NovaBank user")
                  }
                >
                  <Download className="size-4" /> Download as PDF
                </Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    const res = await postRegenerateRecoveryCodes();
                    setCodeList(res.codes);
                    await codes.refetch();
                    toast.success("New codes generated — old ones are now invalid");
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
    </RequireAuth>
  );
}
