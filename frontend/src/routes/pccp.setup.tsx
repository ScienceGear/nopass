import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { MousePointerClick } from "lucide-react";
import { Button } from "@/components/nova/primitives";
import { PasskeyGlyph } from "@/components/nova/PasskeyPrompt";
import { PccpChallenge } from "@/components/nova/PccpChallenge";
import { Footer, Navbar, NovaBackground, PageShell, Reveal } from "@/components/nova/shell";
import { RequireAuth } from "@/components/nova/RequireAuth";
import {
  postPccpRegisterInit,
  postPccpRegisterConfirm,
  type PccpClickWithTiming,
  type PccpDeviceClass,
  type PccpImage,
  ApiError,
} from "@/lib/api";

/**
 * PCCP registration — choose memorable click-points on 3 images over 3
 * repetitions. Requires a completed account (post-onboarding).
 */

export const Route = createFileRoute("/pccp/setup")({
  head: () => ({
    meta: [
      { title: "Set up click-point login  NovaBank" },
      {
        name: "description",
        content:
          "Choose memorable spots on images — a passwordless fallback when passkeys aren't available.",
      },
    ],
  }),
  component: PccpSetupPage,
});

function detectDeviceClass(): PccpDeviceClass {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 768;
  return coarse && narrow ? "mobile" : "desktop";
}

type Stage = "intro" | "capturing" | "done";

function PccpSetupPage() {
  const [stage, setStage] = React.useState<Stage>("intro");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Registration state carried across repetitions.
  const [regToken, setRegToken] = React.useState<string | null>(null);
  const [images, setImages] = React.useState<PccpImage[]>([]);
  const [order, setOrder] = React.useState<string[]>([]);
  const [repetition, setRepetition] = React.useState(1);

  // Derive the ordered image list for the challenge component.
  const imageById = React.useMemo(() => new Map(images.map((img) => [img.id, img])), [images]);
  const orderedImages = React.useMemo(() => order.map((id) => imageById.get(id)!).filter(Boolean), [order, imageById]);

  async function handleGetStarted() {
    setBusy(true);
    setError(null);
    try {
      const res = await postPccpRegisterInit();
      setRegToken(res.token);
      setImages(res.images);
      setOrder(res.order);
      setRepetition(1);
      setStage("capturing");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not start setup. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete(clicks: PccpClickWithTiming[]) {
    if (!regToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postPccpRegisterConfirm({
        token: regToken,
        clicks,
        deviceClass: detectDeviceClass(),
      });
      if (res.complete) {
        setStage("done");
        return;
      }
      if (res.ok === false) {
        setError(res.error ?? "Click-points didn't match. Try again.");
        return;
      }
      if (res.repetition && res.order) {
        setRepetition(res.repetition);
        setOrder(res.order);
      } else {
        setError("Something went wrong — try again from the start.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RequireAuth>
        <NovaBackground>
          <PageShell>
            <section className="space-y-10 pt-12 sm:pt-20">
              {stage === "done" ? (
                <>
                  <Navbar />
                  <Reveal className="mx-auto max-w-2xl text-center">
                    <PasskeyGlyph phase="success" className="mx-auto" />
                    <h1 className="mt-5 text-3xl">Click-points set up</h1>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                      You can now sign in by clicking the same spots on your images. Use the security
                      settings page to re-enroll or disable this method.
                    </p>
                    <Button asChild size="lg" className="mx-auto mt-8">
                      <Link to="/settings/security">Back to security settings</Link>
                    </Button>
                  </Reveal>
                  <Footer />
                </>
              ) : (
                <>
                  <Navbar />
                  <Reveal className="mx-auto max-w-2xl text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-lime-soft text-ink">
                      <MousePointerClick className="size-7" />
                    </span>
                    <h1 className="mt-5 text-3xl">Set up a visual password</h1>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                      Choose memorable spots on 3 images — a passwordless fallback when passkeys
                      aren&apos;t available. You&apos;ll click each spot 3 times so we can learn your
                      pattern.
                    </p>
                  </Reveal>

                  <Reveal className="mx-auto max-w-md">
                    <Button size="lg" className="w-full" onClick={handleGetStarted} disabled={busy}>
                      {busy ? "Starting…" : "Get started"}
                    </Button>
                    {error ? (
                      <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <p className="mt-5 text-center text-sm text-muted-foreground">
                      Already enrolled?{" "}
                      <Link
                        to="/settings/security"
                        className="font-semibold text-ink underline-offset-4 hover:underline"
                      >
                        Manage in security settings
                      </Link>
                    </p>
                  </Reveal>
                  <Footer />
                </>
              )}
            </section>
          </PageShell>
        </NovaBackground>
      </RequireAuth>

      {stage === "capturing" && orderedImages.length > 0 ? (
        <PccpChallenge
          key={`${repetition}-${order.join(",")}`}
          images={orderedImages}
          showViewport
          busy={busy}
          onComplete={handleComplete}
          onCancel={() => {
            setStage("intro");
            setRegToken(null);
            setImages([]);
            setOrder([]);
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}
