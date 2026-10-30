import Link from "next/link";

export function MarketingSecondaryNav({
  currentPath,
}: {
  currentPath: string;
}) {
  const links = [
    { href: "/", label: "Accueil" },
    { href: "/shops", label: "Annuaire" },
    { href: "/tarifs", label: "Tarifs" },
  ];

  return (
    <header className="marketing-secondary-nav">
      <Link
        aria-label="Faso Studio, accueil"
        className="marketing-secondary-nav__brand"
        href="/"
      >
        <span aria-hidden="true" className="marketing-secondary-nav__mark">
          F
        </span>
        <span>Faso Studio</span>
      </Link>
      <nav aria-label="Navigation principale">
        {links.map((link) => (
          <Link
            aria-current={currentPath === link.href ? "page" : undefined}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="marketing-secondary-nav__actions">
        <Link href="/auth/login">Connexion</Link>
        <Link className="marketing-secondary-nav__cta" href="/auth/signup">
          Créer ma boutique
        </Link>
      </div>
    </header>
  );
}
