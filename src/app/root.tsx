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
      <script
        async
        src="https://www.googletagmanager.com/gtm.js?id=GTM-MT8Q2WWK"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
          `,
        }}
      />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href={`${import.meta.env.BASE_URL}favicon.ico`} sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href={`${import.meta.env.BASE_URL}favicon-32x32.png`} />
        <link rel="icon" type="image/png" sizes="16x16" href={`${import.meta.env.BASE_URL}favicon-16x16.png`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`${import.meta.env.BASE_URL}apple-touch-icon.png`} />
        <link rel="manifest" href={`${import.meta.env.BASE_URL}site.webmanifest`} />
        <meta name="google-site-verification" content="4kNX4NjLWXnCoiSI7wlyJThrmFdEA097EG71xGIQxvo" />
        <meta name="google-site-verification" content="zJPHGW4zzRmUCyzQDj3PBXF2944k2JC_ImcGwTA6X-g" />
        <meta name="msvalidate.01" content="76BA1C8DCEF99E50226A25AB58E8C045" />
        <meta name="google-adsense-account" content="ca-pub-9439146206007565"/>
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