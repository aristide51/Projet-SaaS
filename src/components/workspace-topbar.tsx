import Link from "next/link";

type WorkspaceTopbarProps = {
  section: string;
  links: Array<{ href: string; label: string }>;
};

export function WorkspaceTopbar({ section, links }: WorkspaceTopbarProps) {
  return (
    <header className="workspace-topbar">
      <Link
        aria-label="Faso Studio, accueil"
        className="workspace-topbar__brand"
        href="/"
      >
        <span aria-hidden="true" className="workspace-topbar__mark">
          F
        </span>
        <span className="workspace-topbar__brand-copy">
          <strong>Faso Studio</strong>
          <small>{section}</small>
        </span>
      </Link>
      <nav
        aria-label={`Navigation ${section}`}
        className="workspace-topbar__nav"
      >
        {links.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
