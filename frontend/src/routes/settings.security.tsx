import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { AlertTriangle, Check, Clock, Download, KeyRound, Loader2, Mail, MousePointerClick, PhoneCall, Plus, RotateCcw, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
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
  postUserCancelAccountDeletion,
  postUserRequestAccountDeletion,
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

  async function sendPhoneCode(channel: "sms" | "voice" = "sms") {
    if (!phone) return;
    setPhoneBusy(true);
    setPhoneMsg(null);
    try {
      await postPhoneOtpRequest({ phone, purpose: "phone_change", channel });
      setPhoneOtpSent(true);
      setPhoneOtp("");
      if (channel === "voice") {
        toast.success("Calling your phone…", {
          description: `Triggered voice call to ${phone} with your 6-digit code.`,
        });
      } else {
        toast.success("Code sent", { description: `We texted a 6-digit code to ${phone}.` });
      }
    } catch (error) {
      setPhoneMsg(error instanceof Error ? error.message : "Could not send the code.");
    } finally {
      setPhoneBusy(false);
    }
  }
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState<"confirm_details" | "enter_otps">("confirm_details");
  const [deleteEmail, setDeleteEmail] = React.useState("");
  const [deletePhone, setDeletePhone] = React.useState("");
  const [deleteEmailOtp, setDeleteEmailOtp] = React.useState("");
  const [deletePhoneOtp, setDeletePhoneOtp] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteMsg, setDeleteMsg] = React.useState<string | null>(null);

  function openDeletionDialog() {
    setDeleteDialogOpen(true);
    setDeleteStep("confirm_details");
    setDeleteMsg(null);
    setDeleteEmail(profile.data?.email || "");
    setDeletePhone(profile.data?.phone || "");
    setDeleteEmailOtp("");
    setDeletePhoneOtp("");
  }

  async function handleSendDeletionOtps(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteEmail.includes("@") || !deletePhone) {
      setDeleteMsg("Enter your email address and phone number with country code.");
      return;
    }
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      await Promise.all([
        postPhoneOtpRequest({ phone: deletePhone, purpose: "verify", email: deleteEmail }),
        postPhoneOtpRequest({ phone: deletePhone, purpose: "signup", email: deleteEmail, channel: "sms" }).catch(() => null),
      ]);
      toast.success("Verification OTPs sent!", {
        description: `We delivered 6-digit verification codes to ${deleteEmail} and ${deletePhone}.`,
      });
      setDeleteStep("enter_otps");
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : "Could not send verification OTPs.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleConfirmAccountDeletion() {
    if (!/^\d{6}$/.test(deleteEmailOtp) || !/^\d{6}$/.test(deletePhoneOtp)) {
      setDeleteMsg("Enter 6-digit verification codes for both Email and Mobile OTP.");
      return;
    }
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      await postUserRequestAccountDeletion({ emailOtp: deleteEmailOtp, phoneOtp: deletePhoneOtp });
      toast.success("Account scheduled for deletion", {
        description: "Your account will be deleted in 24 hours. You can cancel anytime before then.",
      });
      setDeleteDialogOpen(false);
      await profile.refetch();
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : "Invalid verification codes.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleCancelAccountDeletion() {
    setDeleteBusy(true);
    try {
      await postUserCancelAccountDeletion();
      toast.success("Deletion request cancelled!", { description: "Your account remains active." });
      await profile.refetch();
    } catch (err) {
      toast.error("Could not cancel deletion", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setDeleteBusy(false);
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
                          <div className="space-y-2">
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
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => sendPhoneCode("sms")}
                                disabled={phoneBusy}
                                className="font-medium transition-colors hover:text-ink"
                              >
                                Resend SMS
                              </button>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() => sendPhoneCode("voice")}
                                disabled={phoneBusy}
                                className="flex items-center gap-1.5 font-bold text-ink hover:underline"
                              >
                                <PhoneCall className="size-3.5 text-lime" /> Call me instead
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={phoneBusy}
                              onClick={() => sendPhoneCode("sms")}
                            >
                              {phoneBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                              Text me a code
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-full font-semibold"
                              disabled={phoneBusy}
                              onClick={() => sendPhoneCode("voice")}
                            >
                              <PhoneCall className="size-3.5 text-lime" /> Call me instead
                            </Button>
                          </div>
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
                        {!device.isCurrent ? (
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
                        ) : null}
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
            <Reveal delay={250}>
              <Panel className="border-destructive/20 bg-destructive/5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-destructive/15 text-destructive">
                    <Trash2 className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-ink">Delete Account</h2>
                    <p className="text-sm text-muted-foreground">
                      Request permanent account removal with a 24-hour grace period for recovery.
                    </p>
                  </div>
                </div>

                {profile.data?.scheduledForDeletionAt ? (
                  <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-destructive flex items-center gap-2 text-sm">
                          <Clock className="size-4" /> Account Scheduled for Deletion
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Scheduled removal at:{" "}
                          <span className="font-mono font-medium text-ink">
                            {new Date(profile.data.scheduledForDeletionAt).toLocaleString()}
                          </span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-success/40 text-success hover:bg-success/15"
                        disabled={deleteBusy}
                        onClick={handleCancelAccountDeletion}
                      >
                        <RotateCcw className="size-3.5" /> Cancel Deletion Request
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-between items-center border-t border-hairline pt-4">
                    <p className="text-xs text-muted-foreground">
                      Requires dual verification (Email OTP + Phone OTP).
                    </p>
                    <Button variant="danger" size="sm" onClick={openDeletionDialog}>
                      <Trash2 className="size-3.5" /> Delete My Account
                    </Button>
                  </div>
                )}
              </Panel>
            </Reveal>
          </div>

          {/* Account Deletion Dual Verification Dialog */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent className="rounded-3xl sm:max-w-[28rem]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" /> Request Account Deletion
                </DialogTitle>
                <DialogDescription>
                  Permanent deletion requires dual verification. Scheduled deletion has a 24-hour grace period.
                </DialogDescription>
              </DialogHeader>

              {deleteStep === "confirm_details" ? (
                <form onSubmit={handleSendDeletionOtps} className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="del-email-input" className="text-xs font-semibold">
                      Account Email Address
                    </Label>
                    <Input
                      id="del-email-input"
                      type="email"
                      required
                      value={deleteEmail}
                      onChange={(e) => setDeleteEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="h-11 rounded-2xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="del-phone-input" className="text-xs font-semibold">
                      Registered Mobile Number
                    </Label>
                    <Input
                      id="del-phone-input"
                      type="text"
                      required
                      value={deletePhone}
                      onChange={(e) => setDeletePhone(e.target.value)}
                      placeholder="+919876543210"
                      className="h-11 rounded-2xl font-mono text-sm"
                    />
                  </div>

                  {deleteMsg ? (
                    <p className="rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">
                      {deleteMsg}
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" type="button" className="flex-1" onClick={() => setDeleteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="danger" type="submit" className="flex-1" disabled={deleteBusy}>
                      {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Send Verification OTPs
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="del-email-otp" className="text-xs font-semibold flex items-center justify-between">
                      <span>Email 6-Digit OTP</span>
                      <span className="text-[0.6875rem] text-muted-foreground">Sent to {deleteEmail}</span>
                    </Label>
                    <Input
                      id="del-email-otp"
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      value={deleteEmailOtp}
                      onChange={(e) => setDeleteEmailOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••••"
                      className="tnum h-11 rounded-2xl text-center font-mono text-lg tracking-[0.4em]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="del-phone-otp" className="text-xs font-semibold flex items-center justify-between">
                      <span>Mobile 6-Digit OTP</span>
                      <span className="text-[0.6875rem] text-muted-foreground">Sent to {deletePhone}</span>
                    </Label>
                    <Input
                      id="del-phone-otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={deletePhoneOtp}
                      onChange={(e) => setDeletePhoneOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••••"
                      className="tnum h-11 rounded-2xl text-center font-mono text-lg tracking-[0.4em]"
                    />
                  </div>

                  {deleteMsg ? (
                    <p className="rounded-xl bg-destructive/15 px-3 py-2 text-xs text-destructive">
                      {deleteMsg}
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setDeleteStep("confirm_details")}>
                      ← Back
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={deleteBusy}
                      onClick={handleConfirmAccountDeletion}
                    >
                      {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                      Confirm Deletion (24h)
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

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
