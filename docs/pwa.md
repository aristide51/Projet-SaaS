# PWA et mode hors connexion

## Choix technique

Le projet utilise un service worker natif dans `public/sw.js`, sans Serwist,
Workbox ni plugin de build. La stratégie reste volontairement simple et
indépendante de l’adaptateur : Next.js 16.4 sert le fichier statique `public/`,
et OpenNext indique prendre en charge les versions mineures et correctives de
Next.js 16 ainsi que les assets statiques Cloudflare.

Le déploiement Cloudflare Workers utilise `@opennextjs/cloudflare`. La
configuration du Worker, du cache partagé et des étapes de prévisualisation est
détaillée dans [`deploiement-cloudflare.md`](./deploiement-cloudflare.md) ;
exécuter `pnpm cf:preview` avant chaque mise en production. Serwist s’intègre
par un plugin webpack et une compilation de service worker. Ce couplage n’est
pas utile pour les quelques stratégies contrôlées ici et ajouterait une
dépendance à vérifier avec l’adaptateur.

Références consultées :

- [Guide PWA Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Serwist pour Next.js](https://serwist.pages.dev/docs/next/getting-started)
- [Versions Next.js prises en charge par OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- [Assets statiques et cache Cloudflare](https://opennext.js.org/cloudflare/caching)

## Installation et séparation des surfaces

- Le manifeste `/pwa-manifest.webmanifest` lance l’application sur `/dashboard`,
  avec affichage autonome, couleurs de marque et icônes PNG 192/512 px.
- Seules les pages du tableau de bord publient les métadonnées d’installation
  et affichent l’invite discrète. Le marketing n’ajoute ni manifeste à ses
  métadonnées, ni bouton d’installation.
- Sur Android, ouvrir le tableau de bord dans Chrome puis utiliser l’invite
  « Installer l’application » lorsqu’elle est proposée ; l’installation exige
  un contexte HTTPS en production.
- Le service worker est enregistré depuis les vitrines, le marketing et le
  tableau de bord pour rendre disponibles les pages publiques consultées.
- Une nouvelle version reste en attente jusqu’à ce que l’utilisateur choisisse
  « Mettre à jour ». L’activation supprime uniquement les caches précédents de
  cette application.

## Règles de cache et confidentialité

- Les fichiers `/_next/static/` sont mis en cache en priorité ; leurs noms
  incluent les empreintes produites par Next.js. Les icônes et la page hors
  connexion sont préchargées lors de l’installation du worker.
- Les navigations vers l’accueil, l’annuaire et les routes publiques de boutique
  peuvent utiliser stale-while-revalidate. Le proxy ajoute
  `X-PWA-Cacheable: public` uniquement aux requêtes GET sans cookie et aux
  chemins explicitement publics.
- Le worker n’enregistre une page que si le serveur confirme ce marqueur et
  que la réponse est réussie. Ainsi, HTML de session et réponses qui dépendent
  d’un cookie (authentification ou panier invité) ne deviennent pas des entrées
  de cache.
- Les routes de compte, tableau de bord, paiement, authentification, API et
  Server Actions ne sont jamais mises en cache. Les POST et les requêtes vers
  Supabase ou Storage passent directement au réseau ; `payment-proofs` n’est
  jamais servi depuis un cache de cette application.
- Hors réseau, une page publique déjà enregistrée reste lisible. Une autre
  navigation reçoit une page hors connexion générique, sans HTML privé.
  Le petit script hors ligne préchargé affiche la bannière et bloque les envois
  de formulaires non-GET même si les bundles React n’ont pas pu être hydratés ;
  les commandes et rendez-vous précédemment chargés sont présentés dans cette
  page générique en lecture seule.
- Les instantanés des commandes et rendez-vous sont chiffrés avec AES-GCM
  (256 bits) avant leur écriture dans IndexedDB. Une clé CryptoKey non
  extractible est stockée par utilisateur ; seul l’identifiant de l’utilisateur
  actif permet de retrouver son instantané. Le chiffrement local ne protège pas
  contre du code malveillant de même origine ou une session encore ouverte sur
  un appareil partagé.
- La déconnexion supprime les instantanés et les clés. À la première écriture
  pour un autre identifiant, les données du compte précédent sont purgées.
- Au retour du réseau, la page hors ligne est rechargée ; depuis les pages de
  compte, les données sont redemandées au serveur. Aucune action hors ligne
  n’est mise en attente ou rejouée.
- La page statique `/offline.html` garde la politique CSP de même origine, sans
  `strict-dynamic`, afin que son script externe de lecture puisse s’exécuter
  avec le nonce absent de cette page préchargée. Les routes dynamiques conservent
  leur politique CSP avec nonce et `strict-dynamic`.

Le nom `boutiques-locales-…-2026-11-02-v3` identifie les caches gérés par le
worker. Incrémenter `CACHE_VERSION` lors d’un changement incompatible de
stratégie ; le worker supprime les versions antérieures à l’activation.

## Tests

`e2e/pwa.spec.ts` vérifie le manifeste, le marquage d’une navigation publique,
la disponibilité hors ligne d’une page visitée, le repli générique pour une
route privée et l’isolation des instantanés chiffrés par compte. Exécuter avec
`pnpm test:e2e -- e2e/pwa.spec.ts` dans un environnement de test où
l’application et Supabase local sont disponibles.
