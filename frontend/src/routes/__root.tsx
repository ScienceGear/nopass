import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Compass, TriangleAlert } from "lucide-react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { NovaBackground, PageShell, Navbar, Footer } from "@/components/nova/shell";
import { Button, EmptyState } from "@/components/nova/primitives";

function NotFoundComponent() {
  return (
    <NovaBackground>
      <PageShell>
        <Navbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <EmptyState
            icon={<Compass />}
            title="This page doesn't exist"
            description="The link may be old, or the page moved. Your account and money are unaffected."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/dashboard">Back to dashboard</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Back home</Link>
                </Button>
              </div>
            }
          />
        </div>
        <Footer />
      </PageShell>
    </NovaBackground>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <NovaBackground>
      <PageShell>
        <div className="flex min-h-[70vh] items-center justify-center">
          <EmptyState
            icon={<TriangleAlert />}
            title="This page didn't load"
            description="Something went wrong on our end. Nothing was charged and no session was changed."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() => {
                    router.invalidate();
                    reset();
                  }}
                >
                  Try again
                </Button>
                <Button variant="outline" asChild>
                  <a href="/">Go home</a>
                </Button>
              </div>
            }
          />
        </div>
      </PageShell>
    </NovaBackground>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NovaBank — Banking that can't be phished" },
      {
        name: "description",
        content:
          "NovaBank is a passwordless digital bank. Sign in with a passkey, and let our risk engine watch every session.",
      },
      { name: "author", content: "NovaBank" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#EDF4FF" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
