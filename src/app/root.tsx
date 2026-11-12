import type { ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import "../styles/global.css";
import { SiteShell } from "./layouts/site-shell";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <SiteShell>
      <Outlet />
    </SiteShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <SiteShell>
        <main>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-semibold text-foreground">Page not available</h1>
            <p className="mt-2 text-muted-foreground">
              The request could not be completed. Please try again.
            </p>
          </div>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <main>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-muted-foreground">
            The request could not be completed. Please try again.
          </p>
        </div>
      </main>
    </SiteShell>
  );
}