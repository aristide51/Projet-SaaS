# Assurance qualité — Phase 8

## Direction visuelle

La direction artistique de l’accueil s’inspire de FasoCode-X : Unbounded pour
les titres, Inter pour le texte courant, vert vif (`#08782F`), vert profond
(`#023A16`), rouge (`#E10B17`), jaune (`#F6E400`), blanc et gris très clair.
Le contenu, l’aperçu produit et les composants restent propres à Faso Studio ;
aucune marque, illustration ou composition propriétaire n’est reprise.

L’accueil a été allégé : promesse courte, aperçu d’interface interactif,
fonctionnalités, étapes, offres, points de confiance, FAQ courte et appel à
l’action. Les sous-rubriques de « Solutions » apparaissent au survol ou au
focus clavier ; sur mobile, le menu reste ouvrable au toucher. Les cartes de
fonctionnalités, sans icônes, utilisent des numéros typographiques et
s’animent à leur entrée dans le viewport, puis réagissent au survol. Unbounded
est utilisée pour les titres et Inter pour le texte courant sur toutes les
pages. L’aperçu est identifié comme une démonstration ; aucune photo,
statistique, échéance promotionnelle ou citation client n’est inventée.

## Mouvement, rendu 3D et appareils compatibles

- GSAP et ScrollTrigger sont importés à la demande sur la seule page d’accueil
  marketing ; l’introduction du héros et les révélations au défilement sont
  créées dans `gsap.context` et reverties au démontage.
- Framer Motion anime les cartes et le changement de métier de l’aperçu ; la
  préférence `prefers-reduced-motion` supprime ces transitions et arrête les
  boucles Lottie et Three.js.
- Lottie anime une illustration originale du héros. Les scènes Rive et Spline
  restent optionnelles et sont chargées uniquement si leurs URL sont définies
  dans `NEXT_PUBLIC_RIVE_HERO_SCENE` et `NEXT_PUBLIC_SPLINE_HERO_SCENE`.
- Le contrôle de compatibilité entoure toutes les routes et bloque leur
  interaction tant que les signaux disponibles sont vérifiés. Il contrôle
  notamment Android/iOS, les cœurs CPU et la mémoire signalés, le débit réseau
  annoncé et WebGL2. Ces API ne permettent pas de vérifier exactement le
  modèle, la RAM physique ou la stabilité réelle de la connexion ; un signal
  absent ne vaut pas une mesure fiable.
- Three.js n’est importé qu’après validation de l’appareil. Le rendu est
  suspendu hors écran et ses ressources WebGL sont libérées au démontage. Le
  repli CSS et l’aperçu restent disponibles si l’initialisation WebGL échoue.
- Les pages boutique n’importent aucun de ces composants.

## Vérification automatisée

`e2e/marketing-home.spec.ts` couvre le contenu condensé, l’analyse axe WCAG
2.2 AA, l’ouverture du méga-menu au survol et au focus clavier, la FAQ au
clavier, le menu mobile, le changement de métier dans l’aperçu, le repli 3D
sur un appareil simulé à faible mémoire, le chargement de Three.js après
validation des capacités et l’absence de débordement à 360 px. Exécuter avec
`pnpm test:e2e -- e2e/marketing-home.spec.ts`.

Le workflow Lighthouse CI inclut l’accueil en émulation mobile et applique le
budget LCP de 2,5 s ainsi que les budgets de performance existants.
La matrice Android d’entrée de gamme, iPhone et ordinateur physiques ainsi que
les essais lecteur d’écran doivent être effectués sur les appareils pilotes ;
ils ne sont pas déclarés comme réalisés par les tests automatisés.
