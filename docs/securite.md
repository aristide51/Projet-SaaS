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

## Réauthentification des actions sensibles

Avant une action sensible, le serveur exige une réauthentification datant de moins de 10 minutes. Le composant `ReauthGate` permet de confirmer le mot de passe actuel sans remplacer la session Supabase, ou d’envoyer un nouveau lien magique à l’adresse déjà vérifiée. Le callback n’émet la preuve que pour un lien explicitement créé pour la réauthentification.

La preuve est un cookie `HttpOnly`, `SameSite=Lax`, signé par HMAC-SHA-256, lié à l’identifiant du compte et expirant après 10 minutes. `REAUTH_COOKIE_SECRET` est un secret serveur d’au moins 32 caractères, distinct des clés Supabase ; générer une valeur aléatoire pour chaque environnement et ne jamais la versionner. Toute action sensible doit appeler `hasRecentReauthentication(user.id)` côté serveur avant sa mutation, même si son interface est protégée par `ReauthGate`. La demande de suppression de compte et la réinitialisation du mot de passe le font déjà. Les changements d’adresse e-mail et de clés de paiement devront appliquer le même contrôle lorsqu’ils seront ajoutés.

## Carte de mise en route

Le sélecteur de lieu charge à la demande les tuiles OpenStreetMap via `tile.openstreetmap.org`, avec l’attribution requise. L’adresse saisie n’est pas envoyée à un service de géocodage ; la carte ne reçoit que les coordonnées choisies. Informer les commerçants que leur navigateur contacte le fournisseur de tuiles et que son adresse IP peut lui être visible. Pour le support, renseigner `NEXT_PUBLIC_SUPPORT_WHATSAPP` (format international) et `NEXT_PUBLIC_SUPPORT_EMAIL` dans chaque environnement ; ne pas mettre d’informations client dans les messages d’aide au-delà de l’identifiant boutique et de l’étape.

## Invitations d’équipe

La fonction Edge `send-shop-invitation` utilise les secrets gérés par Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`, ainsi que `RESEND_API_KEY`, `RESEND_FROM_EMAIL` et `APP_BASE_URL`. Configurer ces valeurs avec `supabase secrets set` dans chaque environnement ; ne jamais les inscrire dans le dépôt ni dans les journaux. `APP_BASE_URL` doit être l’origine HTTPS de l’application en production (localhost est accepté en local). La clé `service_role` est réservée à cette fonction Edge : elle ne doit jamais être configurée côté navigateur ou dans les variables `NEXT_PUBLIC_*`.

Les invitations conservent uniquement le SHA-256 du jeton aléatoire, valable sept jours et invalidé après acceptation, révocation ou renvoi. L’acceptation requiert une adresse e-mail confirmée identique à celle invitée. Les modifications des membres et permissions sont réservées au propriétaire via les RPC ; les places d’invitation en attente sont comprises dans le quota `max_staff`.

## Décisions d’administration

Le back-office vérifie le rôle administrateur côté serveur. Les décisions de publication et de suspension passent par `review_shop` et `set_shop_suspended`, qui contrôlent le rôle dans Postgres et écrivent dans `audit_log`. Les décisions créent aussi les notifications in-app prévues par la RPC. `send-shop-review-decision` revérifie le JWT et le rôle avant d’envoyer le message Resend ; configurer `RESEND_API_KEY`, `RESEND_FROM_EMAIL` et `APP_BASE_URL` comme secrets Edge. Si l’envoi échoue après l’enregistrement de la décision, l’interface le signale sans annuler la décision ni masquer la notification in-app.

## Notifications en temps réel

La table `notifications` est publiée dans `supabase_realtime`. RLS limite les lectures et mises à jour à `auth.uid()` ; les privilèges SQL ne permettent de modifier que `read_at`, et les créations/suppressions restent réservées aux fonctions métier de la base. Le client filtre aussi son flux Realtime sur son identifiant ; cette valeur ne remplace jamais les contrôles RLS côté PostgreSQL.

## E-mails transactionnels de commande

L’Edge Function `notify` utilise `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NOTIFY_WEBHOOK_SECRET` et `EMAIL_UNSUBSCRIBE_SECRET`. Configurer ces valeurs dans les secrets Edge de chaque environnement ; les deux secrets dédiés doivent faire au moins 32 caractères et ne doivent jamais être versionnés, exposés au navigateur ou écrits dans les journaux. `NOTIFY_WEBHOOK_SECRET` doit être identique au secret de la ligne de configuration conservée dans `private.notification_email_webhook_settings`. Cette table, la file `notification_email_jobs` et les préférences de désinscription ne sont pas accessibles aux rôles clients.

Renseigner l’URL HTTPS de `notify` et le secret partagé dans la configuration privée du webhook, par un accès d’administration sécurisé. Le trigger SQL ajoute d’abord les tâches à la file ; une panne ou une absence de configuration du webhook ne fait pas échouer la transaction de commande. Configurer aussi un ordonnanceur externe ou Supabase Cron pour appeler périodiquement `notify` en POST, avec l’en-tête `x-notify-secret` et un corps JSON vide `{}` : cet appel récupère les tâches échues et permet les nouvelles tentatives même si l’appel immédiat du trigger a échoué. Ne pas placer le secret dans une URL, un dépôt ou une commande enregistrée dans l’historique du terminal.

Les liens de désinscription utilisent un jeton HMAC à durée limitée et désactivent uniquement les futurs e-mails non essentiels. Les messages transactionnels ne contiennent ni numéro de téléphone ni référence de paiement. La limitation actuelle est de 10 messages par utilisateur et par heure ; la file traite au plus 20 tâches par invocation et abandonne après cinq tentatives.

## Vérifications

- `pnpm test` vérifie le contrôle d’origine, le helper Turnstile et l’expiration/tampering de la preuve de réauthentification.
- `pnpm test:e2e` vérifie les en-têtes CSP, la route `/api/health` et le rejet d’une origine étrangère.
- `pnpm build` vérifie la compilation de production.
