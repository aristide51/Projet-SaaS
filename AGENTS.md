# AGENTS.md

## Projet
Plateforme SaaS multi-boutiques pour commerces locaux du Burkina Faso (quincaillerie, pièces détachées, garage, salon…).
Chaque commerçant crée sa boutique, gère catalogue, commandes et rendez-vous, et encaisse ses clients par mobile money
(paiement par code USSD vérifié par le commerçant au MVP, agrégateur ensuite). La plateforme vit des abonnements.
Public visé : clients avec de bons smartphones ET commerçants sur téléphones modestes. Design haut de gamme, site rapide.

## Source de vérité (à lire avant toute tâche non triviale)
- `docs/cahier-des-charges.md` : fonctionnalités, statuts et transitions (4.15), sécurité (7), feuille de route (10)
- `supabase/migrations/` : schéma, fonctions métier (RPC), RLS. Ne jamais contredire ces fichiers sans migration.
- `supabase/tests/database/` : tests pgTAP des règles d'accès et des règles métier


## Stack
Next.js (App Router) + TypeScript strict · Tailwind · react-hook-form + Zod · Supabase (Postgres, Auth, Storage, Realtime,
Edge Functions) · Resend (e-mails) · Cloudflare (OpenNext) · GSAP + ScrollTrigger · Three.js (usage très limité) · Vitest · Playwright

## Commandes
- `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
- `supabase start` · `supabase db reset` (rejoue migrations + seed) · `supabase test db` (pgTAP)
- `supabase gen types typescript --local > src/types/database.ts` après chaque migration

## Structure attendue
```
src/app/(marketing)      site de la plateforme (animations GSAP / Three.js)
src/app/(shop)/[shop]    vitrine publique d'une boutique (rapide, sobre)
src/app/(dashboard)      tableau de bord commerçant
src/app/(admin)          back-office plateforme
src/app/(account)        compte client : commandes, rendez-vous, avis
src/features/<domaine>   composants + actions + schémas Zod d'un domaine (orders, bookings, catalog…)
src/lib/supabase         clients server / browser / middleware
src/lib/validation       schémas Zod partagés client + serveur
supabase/functions       Edge Functions (webhooks, e-mails, tâches planifiées)
```

## Règles d'or
1. Une tâche = une petite branche. Propose un plan avant de coder, puis implémente par étapes vérifiables.
2. Toute écriture sensible (statut de commande, paiement, prix, remise, abonnement) passe par une RPC SQL existante
   (`transition_order`, `declare_payment`, `create_order_from_cart`, `book_slot`…). Jamais d'UPDATE direct depuis le client.
3. Toute nouvelle table : RLS + politiques + GRANT explicites + test pgTAP, dans la même migration/PR.
4. Montants = entiers en FCFA. Fuseau = `Africa/Ouagadougou` (UTC+0, pas d'heure d'été). Textes d'interface en français simple.
5. Validation Zod côté serveur ET base de données (contraintes CHECK). Ne jamais faire confiance au navigateur.
6. Aucun secret dans le code ni dans le navigateur. `service_role` uniquement dans les Edge Functions / serveur.
7. Mobile d'abord, JavaScript minimal sur les pages boutique, images WebP, `prefers-reduced-motion` respecté.
8. Aucun mot de passe, jeton ou clé API dans les logs, les messages d'erreur ou les captures.

## Définition de « terminé »
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `supabase test db` passent ; parcours testé sur mobile ; états vide/chargement/erreur
traités ; textes en français ; cahier des charges mis à jour si une règle a changé ; aucun `any`, `console.log` ni TODO oublié.

## Interdits
Désactiver la RLS · utiliser `service_role` côté client · stocker un jeton en localStorage · calculer un prix ou une remise côté client
· modifier une migration déjà appliquée (créer une nouvelle) · ajouter une dépendance lourde sans l'expliquer · inventer une règle métier
(demande, ou lis le cahier des charges).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
