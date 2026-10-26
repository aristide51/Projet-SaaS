"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Dialog, Sheet, Toast } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { DesignMotion } from "./design-motion";

type SampleShop = {
  name: string;
  category: string;
  status: "Active" | "En attente";
  sales: string;
};

const sampleShops: SampleShop[] = [
  {
    name: "Atelier Kadi",
    category: "Salon",
    status: "Active",
    sales: "128 500 F",
  },
  {
    name: "La Bonne Pièce",
    category: "Automobile",
    status: "En attente",
    sales: "84 000 F",
  },
];

const shopColumns: DataTableColumn<SampleShop>[] = [
  { key: "name", header: "Boutique", render: (shop) => shop.name },
  { key: "category", header: "Activité", render: (shop) => shop.category },
  {
    key: "status",
    header: "État",
    render: (shop) => (
      <Badge tone={shop.status === "Active" ? "success" : "warning"}>
        {shop.status}
      </Badge>
    ),
  },
  { key: "sales", header: "Ventes", render: (shop) => shop.sales },
];

const tabItems = [
  {
    id: "mobile",
    label: "Mobile money",
    content: <p>Un paiement simple, sur le compte du commerçant.</p>,
  },
  {
    id: "rendez-vous",
    label: "Rendez-vous",
    content: <p>Des créneaux clairs, à l’heure du Burkina Faso.</p>,
  },
  {
    id: "boutique",
    label: "Boutique",
    content: <p>Le catalogue reste rapide et facile à parcourir.</p>,
  },
];

const swatches = [
  {
    token: "Fond",
    variable: "--color-canvas",
    className: "swatch__sample--canvas",
  },
  {
    token: "Surface",
    variable: "--color-surface",
    className: "swatch__sample--surface",
  },
  {
    token: "Texte",
    variable: "--color-ink",
    className: "swatch__sample--ink",
  },
  {
    token: "Secondaire",
    variable: "--color-muted",
    className: "swatch__sample--muted",
  },
  {
    token: "Action",
    variable: "--color-primary",
    className: "swatch__sample--primary",
  },
  {
    token: "Succès",
    variable: "--color-success",
    className: "swatch__sample--success",
  },
  {
    token: "Attention",
    variable: "--color-warning",
    className: "swatch__sample--warning",
  },
  {
    token: "Erreur",
    variable: "--color-danger",
    className: "swatch__sample--danger",
  },
];

export function DesignSystemPage() {
  const [darkTheme, setDarkTheme] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [darkTheme]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 5000);
  }

  return (
    <main className="design-page">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>

      <header className="design-header">
        <Link href="/design" className="brand">
          <span aria-hidden="true" className="brand__mark">
            f.
          </span>
          <span>
            faso<span className="brand__light">studio</span>
          </span>
        </Link>
        <nav aria-label="Navigation de la page Design" className="design-nav">
          <a href="#fondations">Fondations</a>
          <a href="#composants">Composants</a>
          <a href="#mouvement">Mouvement</a>
        </nav>
        <Button
          aria-label={
            darkTheme ? "Activer le thème clair" : "Activer le thème sombre"
          }
          onClick={() => setDarkTheme((current) => !current)}
          size="icon"
          variant="secondary"
        >
          {darkTheme ? (
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="3.2" />
              <path d="M10 1.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.51-6.01-1.42 1.42M5.41 14.59l-1.42 1.42m12.02 0-1.42-1.42M5.41 5.41 3.99 3.99" />
            </svg>
          ) : (
            <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
              <path d="M17.3 12.9A7.3 7.3 0 0 1 7.1 2.7 7.4 7.4 0 1 0 17.3 12.9Z" />
            </svg>
          )}
        </Button>
      </header>

      <div className="design-main" id="contenu">
        <section className="design-hero design-reveal">
          <div className="design-hero__copy">
            <span className="eyebrow">
              <span aria-hidden="true" className="eyebrow__dot" />
              Le langage visuel de Faso
            </span>
            <h1>
              Un commerce local.
              <br />
              <span>Mille belles façons</span>
              <br />
              de grandir.
            </h1>
            <p>
              Des fondations claires, des composants accessibles et une touche
              de mouvement. Pensés pour les commerces du Burkina Faso.
            </p>
            <div className="design-hero__actions">
              <a
                className="ui-button ui-button--primary ui-button--lg"
                href="#composants"
              >
                Explorer les composants
                <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
                  <path d="M4 10h12m-5-5 5 5-5 5" />
                </svg>
              </a>
              <span className="hero-meta">
                <span className="hero-meta__avatars" aria-hidden="true">
                  <span>A</span>
                  <span>M</span>
                  <span>+</span>
                </span>
                Conçu ici, pour ici
              </span>
            </div>
          </div>
          <Card className="hero-preview">
            <div className="hero-preview__top">
              <span className="preview-window__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>BOUTIQUE · OUAGADOUGOU</span>
            </div>
            <div className="preview-shop">
              <div className="preview-shop__logo">K</div>
              <div>
                <p className="preview-shop__name">Chez Aïcha</p>
                <p className="preview-shop__location">
                  Mode & accessoires · Zogona
                </p>
              </div>
              <Badge tone="success">Ouvert</Badge>
            </div>
            <div className="preview-stat">
              <div>
                <span className="preview-stat__label">
                  Ventes cette semaine
                </span>
                <strong>
                  286 500 <small>FCFA</small>
                </strong>
              </div>
              <span className="preview-stat__trend">↗ 12,8 %</span>
            </div>
            <div aria-hidden="true" className="preview-chart">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="preview-axis" aria-hidden="true">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mer</span>
              <span>Jeu</span>
              <span>Ven</span>
              <span>Sam</span>
            </div>
            <div className="preview-note">
              <span aria-hidden="true">✳</span>
              <span>Vos clients vous trouvent, même à distance.</span>
              <span aria-hidden="true">→</span>
            </div>
            <span className="hero-preview__ornament" aria-hidden="true">
              ✳
            </span>
          </Card>
          <div
            aria-hidden="true"
            className="design-hero__sparkle design-hero__sparkle--one"
          >
            ✳
          </div>
          <div
            aria-hidden="true"
            className="design-hero__sparkle design-hero__sparkle--two"
          >
            ✦
          </div>
        </section>

        <section
          aria-label="Principes de design"
          className="principles-strip design-reveal"
        >
          <div>
            <span>01</span>
            <p>Clair, même sur petit écran</p>
          </div>
          <div>
            <span>02</span>
            <p>Confiance à chaque étape</p>
          </div>
          <div>
            <span>03</span>
            <p>Rapide, dans chaque quartier</p>
          </div>
        </section>

        <section className="design-section design-reveal" id="fondations">
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 — Fondations</span>
              <h2>Des choix qui font sens.</h2>
            </div>
            <p>
              Des couleurs lisibles, des formes accueillantes et un rythme qui
              laisse la place à l’essentiel.
            </p>
          </div>

          <Card className="foundation-card">
            <div className="foundation-card__header">
              <div>
                <h3>Couleurs sémantiques</h3>
                <p>Chaque teinte a un rôle. Chaque rôle reste lisible.</p>
              </div>
              <span className="token-label">
                THÈME {darkTheme ? "SOMBRE" : "CLAIR"}
              </span>
            </div>
            <div className="swatch-grid">
              {swatches.map(({ token, variable, className }) => (
                <div className="swatch" key={token}>
                  <span
                    aria-hidden="true"
                    className={`swatch__sample ${className}`}
                  />
                  <span className="swatch__name">{token}</span>
                  <code>{variable}</code>
                </div>
              ))}
            </div>
            <div className="foundation-details">
              <div>
                <span className="foundation-details__icon">Aa</span>
                <span>
                  <strong>2 familles locales</strong>
                  <small>Manrope · DM Sans</small>
                </span>
              </div>
              <div>
                <span className="foundation-details__icon">↕</span>
                <span>
                  <strong>Un rythme régulier</strong>
                  <small>4 · 8 · 12 · 16 · 24 · 32</small>
                </span>
              </div>
              <div>
                <span className="foundation-details__icon">◒</span>
                <span>
                  <strong>Douceur mesurée</strong>
                  <small>Rayons · ombres · mouvement</small>
                </span>
              </div>
            </div>
          </Card>
        </section>

        <section className="design-section design-reveal" id="composants">
          <div className="section-heading">
            <div>
              <span className="eyebrow">02 — Les essentiels</span>
              <h2>Petits détails. Grandes journées.</h2>
            </div>
            <p>
              Chaque élément est prêt pour le clavier, lisible et cohérent avec
              les autres.
            </p>
          </div>

          <div className="component-grid">
            <Card className="component-card component-card--wide">
              <div className="component-card__heading">
                <div>
                  <h3>Boutons</h3>
                  <p>Une action claire, un retour immédiat.</p>
                </div>
                <code>Button</code>
              </div>
              <div className="button-demo">
                <Button>
                  Continuer <span aria-hidden="true">→</span>
                </Button>
                <Button variant="secondary">En savoir plus</Button>
                <Button variant="ghost">Annuler</Button>
                <Button variant="danger">Supprimer</Button>
                <Button disabled>Indisponible</Button>
              </div>
              <div className="button-demo button-demo--sizes">
                <Button size="sm" variant="secondary">
                  Petit
                </Button>
                <Button size="md" variant="secondary">
                  Standard
                </Button>
                <Button size="lg">Grand</Button>
              </div>
            </Card>

            <Card className="component-card">
              <div className="component-card__heading">
                <div>
                  <h3>Champs de formulaire</h3>
                  <p>Des repères utiles, sans deviner.</p>
                </div>
                <code>FormField</code>
              </div>
              <div className="field-stack">
                <FormField
                  hint="Un lien de connexion vous sera envoyé."
                  label="Adresse e-mail"
                  required
                >
                  <Input
                    autoComplete="email"
                    placeholder="exemple@boutique.bf"
                    type="email"
                  />
                </FormField>
                <FormField
                  error="Ce numéro ne semble pas complet."
                  label="Téléphone"
                  required
                >
                  <Input
                    autoComplete="tel"
                    hasError
                    placeholder="+226 70 00 00 00"
                    type="tel"
                  />
                </FormField>
                <FormField
                  hint="Quelques mots suffisent."
                  label="Votre message"
                >
                  <Textarea
                    placeholder="Comment pouvons-nous vous aider ?"
                    rows={3}
                  />
                </FormField>
                <FormField label="Ville">
                  <Select defaultValue="ouagadougou">
                    <option value="ouagadougou">Ouagadougou</option>
                    <option value="bobo">Bobo-Dioulasso</option>
                    <option value="koudougou">Koudougou</option>
                  </Select>
                </FormField>
              </div>
              <div className="check-row">
                <Checkbox defaultChecked id="demo-news" />
                <label htmlFor="demo-news">
                  Recevoir les actualités de la boutique
                </label>
              </div>
              <div className="check-row">
                <Checkbox id="demo-terms" />
                <label htmlFor="demo-terms">
                  J’accepte les conditions de vente
                </label>
              </div>
              <div className="switch-row">
                <div>
                  <strong>Accepter les commandes</strong>
                  <span>La boutique reste visible.</span>
                </div>
                <Switch
                  aria-label="Accepter les commandes"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
            </Card>

            <Card className="component-card">
              <div className="component-card__heading">
                <div>
                  <h3>États et étiquettes</h3>
                  <p>Un statut, une prochaine étape.</p>
                </div>
                <code>Badge · Skeleton</code>
              </div>
              <div className="badge-row">
                <Badge>En brouillon</Badge>
                <Badge tone="success">Confirmée</Badge>
                <Badge tone="warning">À vérifier</Badge>
                <Badge tone="danger">Annulée</Badge>
                <Badge tone="info">Information</Badge>
              </div>
              <div aria-hidden="true" className="skeleton-demo">
                <Skeleton className="skeleton-demo__avatar" />
                <div>
                  <Skeleton className="skeleton-demo__line" />
                  <Skeleton className="skeleton-demo__line skeleton-demo__line--short" />
                </div>
                <Skeleton className="skeleton-demo__button" />
              </div>
              <EmptyState
                action={
                  <Button onClick={showToast} variant="secondary">
                    Ajouter un produit
                  </Button>
                }
                description="Ajoutez vos premiers articles pour que vos clients puissent les découvrir."
                title="Votre catalogue commence ici"
              />
            </Card>

            <Card className="component-card">
              <div className="component-card__heading">
                <div>
                  <h3>Fenêtres et panneau</h3>
                  <p>Le contexte reste visible.</p>
                </div>
                <code>Dialog · Sheet</code>
              </div>
              <div className="overlay-demo">
                <Button onClick={() => setDialogOpen(true)}>
                  Ouvrir la fenêtre
                </Button>
                <Button onClick={() => setSheetOpen(true)} variant="secondary">
                  Voir le panneau
                </Button>
              </div>
              <p className="component-note">
                La touche Échap ferme la fenêtre. Le focus reste dans le
                panneau.
              </p>
            </Card>

            <Card className="component-card component-card--wide">
              <div className="component-card__heading">
                <div>
                  <h3>Onglets et données</h3>
                  <p>À l’aise au clavier, aussi bien qu’au téléphone.</p>
                </div>
                <code>Tabs · DataTable</code>
              </div>
              <Tabs items={tabItems} label="Fonctionnalités de la plateforme" />
              <DataTable
                caption="Boutiques pilotes et leurs ventes"
                columns={shopColumns}
                getRowKey={(shop) => shop.name}
                rows={sampleShops}
              />
            </Card>

            <Card className="component-card">
              <div className="component-card__heading">
                <div>
                  <h3>Retour à l’action</h3>
                  <p>Les retours restent brefs et utiles.</p>
                </div>
                <code>Toast</code>
              </div>
              <p className="component-note">
                À chaque action, une confirmation claire rassure.
              </p>
              <Button onClick={showToast} variant="secondary">
                Tester une confirmation
              </Button>
            </Card>
          </div>
        </section>

        <section className="design-section design-reveal" id="mouvement">
          <div className="section-heading">
            <div>
              <span className="eyebrow">03 — Le mouvement</span>
              <h2>Un souffle. Pas un détour.</h2>
            </div>
            <p>
              Les animations accompagnent la lecture et respectent les
              préférences de chacun.
            </p>
          </div>
          <Card className="motion-card">
            <DesignMotion />
            <div className="motion-footer">
              <span>
                <i /> ScrollTrigger révèle les sections à l’écran
              </span>
              <span>Réduction des animations respectée</span>
            </div>
          </Card>
        </section>

        <footer className="design-footer">
          <a className="brand" href="#contenu">
            <span aria-hidden="true" className="brand__mark">
              f.
            </span>
            <span>
              faso<span className="brand__light">studio</span>
            </span>
          </a>
          <p>
            Conçu avec soin, pour les commerces d’ici.{" "}
            <span aria-hidden="true">✳</span>
          </p>
          <a href="#contenu">Retour en haut ↑</a>
        </footer>
      </div>

      <Dialog
        description="Vérifiez les détails avant de publier votre boutique."
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        title="Prête à être découverte ?"
      >
        <p className="dialog-copy">
          Votre boutique sera envoyée à notre équipe pour vérification.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setDialogOpen(false)} variant="secondary">
            Pas encore
          </Button>
          <Button
            onClick={() => {
              setDialogOpen(false);
              showToast();
            }}
          >
            Envoyer la boutique
          </Button>
        </div>
      </Dialog>

      <Sheet
        description="Retrouvez ici les actions utiles à votre activité."
        onOpenChange={setSheetOpen}
        open={sheetOpen}
        title="Votre boutique"
      >
        <nav aria-label="Actions de la boutique" className="sheet-links">
          <a href="#composants" onClick={() => setSheetOpen(false)}>
            Gérer le catalogue <span aria-hidden="true">→</span>
          </a>
          <a href="#composants" onClick={() => setSheetOpen(false)}>
            Voir les commandes <span aria-hidden="true">→</span>
          </a>
          <a href="#fondations" onClick={() => setSheetOpen(false)}>
            Personnaliser la boutique <span aria-hidden="true">→</span>
          </a>
        </nav>
        <Button onClick={() => setSheetOpen(false)} variant="secondary">
          Fermer le panneau
        </Button>
      </Sheet>

      {toastVisible ? (
        <div className="toast-viewport">
          <Toast
            description="Votre action a bien été prise en compte."
            onDismiss={() => setToastVisible(false)}
            title="C’est enregistré"
          />
        </div>
      ) : null}
    </main>
  );
}
