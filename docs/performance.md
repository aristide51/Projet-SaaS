# Budget de performance web

## Contrôle continu

Le workflow `Lighthouse CI` mesure en émulation mobile les parcours :

- accueil de la plateforme : `/`
- vitrine : `/lhci-boutique`
- produit : `/lhci-boutique/products/b0000000-0000-4000-8000-000000000001`
- annuaire : `/shops?ville=Ouagadougou`

Il démarre une base Supabase locale, applique toutes les migrations, ajoute des données de démonstration isolées, construit l’application de production puis exécute trois mesures Lighthouse par URL. Les rapports sont conservés comme artefacts du workflow. Une assertion en erreur fait échouer le contrôle CI.

| Mesure                                                     |        Budget CI |
| ---------------------------------------------------------- | ---------------: |
| Score Performance Lighthouse                               |           ≥ 0,90 |
| LCP                                                        |       ≤ 2 500 ms |
| CLS                                                        |           ≤ 0,10 |
| JavaScript transféré                                       | ≤ 200 000 octets |
| Total Blocking Time, indicateur de laboratoire lié à l’INP |         ≤ 200 ms |

Lighthouse ne produit pas de mesure terrain INP reproductible pendant une navigation sans interaction. Le Total Blocking Time est donc un garde-fou CI pour le travail JavaScript bloquant ; il ne remplace pas l’INP réel, qui doit être suivi via les données de terrain lorsqu’elles seront disponibles.

## Mesure de référence locale

Dernière campagne locale : LHCI 0.15.1, trois runs mobiles par route. Le CLS reste dans le budget après le rendu serveur du QR code et la génération des liens de partage côté serveur. Le TBT, le poids JavaScript et le score Performance dépassent leurs budgets sur les trois routes ; le LCP dépasse aussi le seuil sur la vitrine et l’annuaire. Le workflow est donc censé échouer jusqu’à réduction du travail bloquant et du JavaScript.

| Route    | Performance médiane | LCP médian | CLS max. | TBT médian | JavaScript transféré |
| -------- | ------------------: | ---------: | -------: | ---------: | -------------------: |
| Vitrine  |                0,69 |   3 810 ms |     0,00 |     786 ms |       237 551 octets |
| Produit  |                0,82 |   1 986 ms |     0,02 |     647 ms |       240 439 octets |
| Annuaire |                0,69 |   3 719 ms |     0,00 |     783 ms |       232 502 octets |

Ces chiffres proviennent du Chrome installé sur le poste local et servent de diagnostic, pas de référence de production. Une extension locale injecte un script qui provoque une erreur CSP dans Lighthouse ; le workflow CI sur un navigateur propre reste la mesure de référence.

## Images, polices et scripts

- Conserver les visuels de catalogue optimisés, dimensionnés selon leur contexte ; éviter les images décoratives lourdes au-dessus de la ligne de flottaison.
- Les polices locales sont préférées aux chargements tiers. Ne charger les polices variables qu’avec les graisses réellement utilisées.
- Ne pas ajouter de scripts tiers synchrones aux vitrines. Les outils de mesure et widgets non essentiels restent désactivés sur les pages publiques.
- Le QR code est rendu côté serveur ; seules les actions de copie et de téléchargement sont interactives. Les pages boutique, produit et annuaire gardent leur rendu serveur.

## Cache et revalidation

- Les données publiques des boutiques, catalogues, avis, annuaire et sitemap utilisent les caches Next.js avec des tags et une durée de revalidation bornée.
- Les changements de boutique invalident les tags publics correspondants. Les routes de sitemap et `robots.txt` restent générées côté serveur avec une URL canonique explicite.
- En production Cloudflare/OpenNext, garder le cache CDN activé pour les ressources immuables et les images publiques ; ne jamais mettre en cache les réponses personnalisées, les sessions ou les parcours privés. La revalidation Next.js demeure la source de cohérence pour les données éditables.
- Après un déploiement, vérifier les en-têtes `Cache-Control` et `Content-Type` des pages, images et métadonnées sur le domaine de production ; la politique CDN exacte doit suivre la configuration OpenNext déployée.

## Revue avant déploiement

Vérifier le rapport Lighthouse CI pour les trois routes, le poids des scripts, les images de premier écran et l’absence de requête tierce inutile. Toute évolution des seuils doit être accompagnée d’une mesure et d’une justification dans cette note.
