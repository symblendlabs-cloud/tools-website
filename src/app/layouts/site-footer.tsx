import { Link } from "react-router";
import { Container } from "../../ui/container";

interface FooterLink {
  to: string;
  label: string;
}

const FOOTER_LINKS: FooterLink[] = [
  { to: "/tools/", label: "Tools" },
  { to: "/categories/", label: "Categories" },
  { to: "/guides/", label: "Guides" },
  { to: "/about/", label: "About" },
  { to: "/contact/", label: "Contact" },
  { to: "/privacy/", label: "Privacy" },
  { to: "/terms/", label: "Terms" },
];
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <Container>
        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-primary" />
            <span className="font-medium text-foreground">Chifral</span>
            <span aria-hidden="true">·</span>
            <span>A modular browser-based utilities platform.</span>
          </div>

          <nav aria-label="Footer">
            <ul className="flex items-center gap-4">
              {FOOTER_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground no-underline hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-border py-4">
          <p className="text-xs text-subtle-foreground">
            © {year} Chifral. All processing runs in your browser.
          </p>
        </div>
      </Container>
    </footer>
  );
}