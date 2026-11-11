# Déploiement Cloudflare Workers

L’application utilise le rendu serveur, les Server Actions et les cookies
HttpOnly. Elle doit être déployée sur **Cloudflare Workers avec OpenNext**, pas
comme un export statique Cloudflare Pages.

## Démarrage sans service payant

La configuration de démarrage n’exige ni R2, ni D1, ni Durable Object, ni
Cloudflare Images. OpenNext utilise ses implémentations `dummy` pour le cache
incrémental, l’invalidation par tags et la queue : les résultats de
`unstable_cache` ne sont pas conservés entre les requêtes. Les lectures des
boutiques publiques repartent donc vers Supabase à chaque requête. Les appels
existants à `revalidatePath` et `revalidateTag` n’ont pas de cache persistant à
invalider dans ce mode.

`next/image` sert les URL sources sans transformation ni génération de formats
ou tailles optimisés. Cela évite de dépendre de Cloudflare Images au lancement.

La base D1 créée précédemment sur le compte Cloudflare reste inutilisée; elle
n’est ni liée au Worker ni nécessaire au déploiement. Aucune ressource existante
n’est supprimée.

Au moment de la rédaction, Workers Free inclut jusqu’à 100 000 requêtes par jour
et 10 ms de CPU par invocation. Vérifier les limites Cloudflare en vigueur et
tester les routes dynamiques : une application Next.js SSR peut dépasser cette
limite. Les accès Supabase ont leurs propres quotas et conditions.

## Variables et secrets

Copier `.env.example` vers `.env.local` pour le développement local. Pour les
builds de production et le déploiement continu, fournir ces variables au
processus de build :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (URL HTTPS publique)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` si Turnstile est activé
- `NEXT_PUBLIC_SENTRY_DSN` si Sentry est activé
- `NEXT_PUBLIC_SUPPORT_WHATSAPP` et `NEXT_PUBLIC_SUPPORT_EMAIL` si configurés

Les variables `NEXT_PUBLIC_*` sont intégrées au build Next.js ; les configurer
dans l’environnement de build Cloudflare, pas uniquement comme secrets runtime
du Worker. Ajouter les secrets serveur dans les réglages Worker ou les saisir
à l’invite Wrangler, sans les placer dans le dépôt :

```bash
pnpm exec wrangler secret put REAUTH_COOKIE_SECRET
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
```

`REAUTH_COOKIE_SECRET` doit être distinct pour chaque environnement et contenir
au moins 32 caractères. Ne définir `TURNSTILE_SECRET_KEY` que si Turnstile est
activé. Dans Supabase Auth, configurer l’URL publique comme Site URL et autoriser
les URL de callback de production.

Pour le serveur de développement Next.js avec les bindings locaux OpenNext,
copier `.dev.vars.example` vers `.dev.vars`. Les valeurs Supabase restent dans
`.env.local`.

## Environnement de build WSL

OpenNext signale une prise en charge Windows limitée; son empaquetage a échoué
sur cette machine à cause des liens de dépendances. Node.js 24 et pnpm 12 sont
installés dans le profil WSL, sans modifier le code source du projet. Depuis
WSL :

```bash
export PATH="$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.local/pnpm/bin:$PATH"
cd "/mnt/c/Users/ALFRED GUENOLE/Desktop/Projet SaaS"
pnpm install --frozen-lockfile
pnpm cf:build
pnpm cf:preview
pnpm cf:deploy
```

Les commandes ci-dessus se lancent dans un shell Linux WSL, pas dans
PowerShell. `cf:preview` lance le Worker dans le runtime local Wrangler :
vérifier l’accueil, une vitrine, les URL d’images, l’authentification et une
Server Action. `cf:deploy` publie sur `workers.dev` avec les identifiants
Wrangler et les variables de production. Attacher ensuite un domaine si
disponible et vérifier les en-têtes transmis par le proxy, notamment
`x-forwarded-host` et `x-forwarded-proto`.

Next.js 16 exécute `src/proxy.ts` dans le runtime Node.js. OpenNext signale que
ce support est expérimental sur Cloudflare ; le proxy de ce projet émet la CSP,
vérifie l’origine des écritures et actualise les sessions. Ne pas mettre en
production avant d’avoir vérifié ces trois parcours dans `pnpm cf:preview`.

Lorsque le compte pourra activer R2, on pourra remplacer le cache `dummy` par
R2 et restaurer l’invalidation persistante adaptée. Cloudflare Images pourra
également être réactivé séparément pour optimiser les images.

Les règles WAF et les limites de débit restent à configurer séparément comme
décrit dans [`securite.md`](./securite.md).
