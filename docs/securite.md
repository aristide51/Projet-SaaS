# Sécurité et observabilité

## En-têtes HTTP

Le proxy Next.js émet une CSP par réponse avec un nonce cryptographiquement aléatoire transmis à Next.js pour les scripts et blocs de style générés par le framework. Les scripts et styles inline sans nonce sont interdits ; `unsafe-eval` n’est permis qu’en développement pour les outils React. Une future intégration du widget Turnstile devra transmettre le nonce au script Cloudflare, car la directive `strict-dynamic` ignore les listes d’hôtes dans les navigateurs compatibles.

Les sources Supabase et Sentry configurées, ainsi que Cloudflare Turnstile, sont limitées aux directives CSP qui en ont besoin. En production, le proxy ajoute HSTS (`max-age=63072000; includeSubDomains`) et `upgrade-insecure-requests`. Il ajoute également `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` et une `Permissions-Policy` restrictive.

Une CSP avec nonce nécessite un rendu dynamique des pages HTML. Avant d’ajouter une intégration externe, ajouter uniquement son origine aux directives correspondantes et tester le parcours dans un navigateur ; ne pas élargir `script-src` avec `unsafe-inline`.

## Origine des requêtes d’écriture

Le proxy refuse les requêtes `POST`, `PUT`, `PATCH` et `DELETE` sans `Origin` ou dont l’origine diffère de celle de la requête. Le contrôle couvre ainsi les Server Actions Next.js et les Route Handlers Next.js, avant leur exécution. Next.js conserve également son contrôle natif d’origine des Server Actions.

Les webhooks serveur-à-serveur ne doivent pas être exemptés globalement de ce contrôle : si un webhook est ajouté, son endpoint devra être explicitement exclu de la vérification d’origine et vérifier une signature cryptographique ainsi que l’idempotence avant toute écriture. Cloudflare doit transmettre l’hôte et le protocole publics d’origine jusqu’à Next.js afin que la comparaison reste correcte derrière son proxy.

## Cloudflare : règles à créer manuellement

À configurer dans **Security → WAF → Rate limiting rules** pour chaque zone Cloudflare en production. Les chemins exacts des routes applicatives d’authentification et d’écriture ne sont pas encore créés ; adapter les expressions à leurs chemins définitifs avant activation. Les seuils ci-dessous sont des points de départ à ajuster selon le trafic réel et les faux positifs, notamment les adresses IP partagées par les réseaux mobiles.

| Parcours                                   | Cible                                                                                                                                   | Action conseillée                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inscription, connexion et réinitialisation | `POST` vers les routes applicatives correspondantes ; si Supabase Auth passe un jour par la zone Cloudflare, ses endpoints `/auth/v1/*` | Limiter les tentatives par IP, appliquer un challenge géré en cas de dépassement et bloquer temporairement les abus répétés. Activer aussi les limites natives Supabase Auth. |
| Création de commande                       | `POST` sur les futurs endpoints de commande                                                                                             | Limiter par IP au WAF ; appliquer en plus une limite par utilisateur authentifié côté serveur/Edge Function, car une limite IP seule ne suffit pas.                           |
| Déclaration de paiement                    | `POST` sur le futur endpoint de déclaration USSD                                                                                        | Limite plus stricte par IP au WAF et par utilisateur côté serveur ; alerter sur les dépassements répétés. Ne jamais considérer le WAF comme validation de paiement.           |

Ne pas mettre de secrets dans les expressions ni les journaux Cloudflare. Les événements de paiement et les décisions métier doivent rester vérifiés côté serveur et dans les RPC/Edge Functions. Les appels actuels au projet Supabase direct ne traversent pas le WAF de l’application ; configurer les protections Supabase Auth séparément jusqu’à la mise en place éventuelle d’un proxy explicite.

## Turnstile

`verifyTurnstileToken(token, remoteIp?)` vérifie un jeton auprès de l’API officielle Cloudflare avec `TURNSTILE_SECRET_KEY`, uniquement côté serveur. Le helper échoue explicitement si la clé manque, si la réponse distante est incorrecte ou si l’API ne répond pas. Les futurs formulaires d’inscription/connexion devront aussi transmettre un jeton obtenu avec la clé de site publique et refuser la mutation si la vérification renvoie `false`.

## Journaux et erreurs

Le logger central n’écrit que le niveau et un nom d’événement contrôlé ; il ne journalise ni message d’erreur, ni entrée utilisateur, ni en-têtes, cookies ou jetons. Sentry est désactivé tant que `NEXT_PUBLIC_SENTRY_DSN` n’est pas configurée. Quand il est activé, l’envoi par défaut des données personnelles est désactivé, les informations de requête et les messages d’exception sont masqués, et les limites de rétention/accès doivent être réglées dans le projet Sentry.

Les frontières d’erreur affichent un message français générique et proposent une nouvelle tentative ; elles ne révèlent pas le détail interne au navigateur.

## Vérifications

- `pnpm test` vérifie le contrôle d’origine et le helper Turnstile.
- `pnpm test:e2e` vérifie les en-têtes CSP, la route `/api/health` et le rejet d’une origine étrangère.
- `pnpm build` vérifie la compilation de production.
