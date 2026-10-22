# Plateforme SaaS pour commerces locaux

Application Next.js pour la gestion de boutiques, commandes, rendez-vous et paiements mobiles au Burkina Faso.

## Prérequis

- Node.js 20.9 ou ultérieur
- pnpm 9 ou ultérieur

## Démarrage

1. Installer les dépendances : `pnpm install`
2. Copier `.env.example` vers `.env.local` et renseigner les variables Supabase.
3. Lancer le serveur : `pnpm dev`

Le serveur refuse de démarrer si l’URL Supabase ou sa clé anonyme est absente ou invalide. Ne place jamais de clé `service_role` dans une variable `NEXT_PUBLIC_*`.

## Supabase local

- Démarrer les services locaux : `pnpm db:start`
- Rejouer les migrations : `pnpm db:reset`
- Exécuter les tests pgTAP : `pnpm db:test`
- Générer les types TypeScript depuis la base locale : `pnpm db:types`
- Arrêter les services locaux : `pnpm db:stop`

L’API locale est disponible sur `http://127.0.0.1:55421`. Après `pnpm db:start`, récupère la clé publique `ANON_KEY` avec `pnpm exec supabase status` pour remplir `.env.local`. N’utilise jamais `SERVICE_ROLE_KEY` dans l’application.

Les tests de base de données installent leurs propres données de test. Le chargement de seed est donc désactivé dans `supabase/config.toml`.

Les sessions d’authentification sont conservées dans des cookies `HttpOnly` et gérées côté serveur. Le client Supabase du navigateur est limité aux accès publics et ne persiste pas de session.

## Sécurité et observabilité

Les règles d’en-têtes HTTP, la vérification d’origine, Turnstile, Sentry et les règles WAF/rate limiting à configurer manuellement sur Cloudflare sont détaillés dans [`docs/securite.md`](./docs/securite.md). Configure `NEXT_PUBLIC_SENTRY_DSN` pour activer la remontée d’erreurs et `TURNSTILE_SECRET_KEY` pour permettre la vérification des jetons côté serveur. Ces deux intégrations sont optionnelles en développement ; une vérification Turnstile échoue explicitement si sa clé serveur manque.

## Système de design

En développement (`pnpm dev`), ouvre `/design` pour consulter les jetons, composants et états interactifs. Cette route renvoie une page introuvable en production. Les polices Manrope et DM Sans sont auto-hébergées dans `src/app/fonts` avec leurs licences.

Les couleurs, l’espacement, les rayons, les ombres et le mouvement sont définis sous forme de propriétés CSS sémantiques dans `src/app/globals.css`. Les animations GSAP/ScrollTrigger et la scène Three.js sont chargées uniquement sur la galerie de design, jamais sur les vitrines publiques ; `prefers-reduced-motion` désactive les animations.

## Authentification

Les pages `/auth/signup`, `/auth/login`, `/auth/magic-link`, `/auth/forgot-password` et `/auth/reset-password` utilisent React Hook Form, Zod, des Server Actions et le client Supabase serveur. Les sessions restent dans des cookies `HttpOnly`; aucun jeton d’authentification n’est stocké dans `localStorage` ou `sessionStorage`. Les routes `/account`, `/dashboard` et `/admin` sont vérifiées dans le proxy et dans leurs layouts serveur. L’adresse e-mail doit être confirmée, et l’administration exige le rôle global correspondant en base.

Configure `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY` dans `.env.local`, puis active Google OAuth dans Supabase pour utiliser les parcours correspondants. Le développement local exige la confirmation d’e-mail ; les messages de test sont consultables dans Inbucket sur `http://127.0.0.1:55424`. Les clés Turnstile de test Playwright sont réservées à l’environnement des tests.

## Vérifications

- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

Les tests Playwright utilisent des valeurs factices, sans connexion à un projet Supabase.

## Organisation du code

- `src/app/(marketing)` : site de présentation
- `src/app/(shop)/[shop]` : boutiques publiques
- `src/app/(dashboard)` : espace commerçant
- `src/app/(admin)` : administration
- `src/app/(account)` : espace client
- `src/features` : domaines fonctionnels
- `src/lib/supabase` : clients Supabase
- `src/lib/validation` : schémas de validation partagés
- `supabase/migrations` et `supabase/tests/database` : schéma, règles d’accès et tests SQL
