import Link from "next/link";

type MarketingHeaderProps = Readonly<{
  currentPath: "/" | "/shops";
}>;

export function MarketingHeader({ currentPath }: MarketingHeaderProps) {
  const sectionLinks = [
    { href: "#solutions", label: "Solutions" },
    { href: "#fonctionnement", label: "Comment ça marche" },
    { href: "#offres", label: "Tarifs" },
  ];
  const destination = (href: string) =>
    currentPath === "/" ? href : `/${href}`;

  return (
    <header className="marketing-header">
      <div className="marketing-utility-bar">
        <p>Le numérique au service des commerces du Burkina.</p>
        <div className="marketing-utility-bar__meta">
          <span>Tarifs en FCFA</span>
          <span aria-hidden="true">·</span>
          <span>Mobile Money</span>
        </div>
      </div>
      <div className="marketing-header__main">
        <Link className="marketing-brand" href="/">
          <span aria-hidden="true" className="marketing-brand__mark">
            F
          </span>
          <span>Faso Studio</span>
        </Link>
        <nav aria-label="Navigation principale" className="marketing-nav">
          {sectionLinks.map((link) => (
            <Link href={destination(link.href)} key={link.href}>
              {link.label}
            </Link>
          ))}
          <Link
            aria-current={currentPath === "/shops" ? "page" : undefined}
            href="/shops"
          >
            Annuaire
          </Link>
        </nav>
        <div className="marketing-header__actions">
          <Link className="marketing-login" href="/auth/login">
            Connexion
          </Link>
          <Link
            className="marketing-button marketing-button--small"
            href="/auth/signup"
          >
            Créer ma boutique
          </Link>
        </div>
        <details className="marketing-mobile-menu">
          <summary aria-label="Ouvrir le menu de navigation">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span className="marketing-mobile-menu__label">Menu</span>
          </summary>
          <nav aria-label="Navigation mobile">
            {sectionLinks.map((link) => (
              <Link href={destination(link.href)} key={link.href}>
                {link.label}
              </Link>
            ))}
            <Link
              aria-current={currentPath === "/shops" ? "page" : undefined}
              href="/shops"
            >
              Annuaire
            </Link>
            <Link href="/auth/login">Connexion</Link>
            <Link className="marketing-button" href="/auth/signup">
              Créer ma boutique
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
