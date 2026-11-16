import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Container } from "../../ui/container";

interface NavLink {
  to: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { to: "/tools/", label: "Tools" },
  { to: "/categories/", label: "Categories" },
  { to: "/guides/", label: "Guides" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <Container>
        <div className="flex h-14 items-center justify-between">
          <Link
            to="/"
            onClick={closeMobile}
            className="flex items-center no-underline"
            aria-label="Chifral — homepage"
          >
            <img
              src={`${import.meta.env.BASE_URL}assets/brand/logo.png`}
              alt="Chifral"
              width={2736}
              height={912}
              className="h-8 w-auto"
            />
          </Link>

          <nav aria-label="Primary" className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors " +
                    (active
                      ? "bg-surface-muted text-foreground"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-muted"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              {mobileOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className={(mobileOpen ? "block" : "hidden") + " sm:hidden pb-3"}
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => {
              const active = isActive(link.to);
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={closeMobile}
                    aria-current={active ? "page" : undefined}
                    className={
                      "block rounded-md px-3 py-2 text-sm font-medium no-underline " +
                      (active
                        ? "bg-surface-muted text-foreground"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground")
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Container>
    </header>
  );
}