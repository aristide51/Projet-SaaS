# Assurance qualité — Phase 8

## Direction visuelle

La page marketing reprend la palette FasoCode-X demandée : vert profond
(`#066624`, `#0A2A18`), rouge (`#CC0018`), jaune (`#F6EA06`) réservé aux
accents sur fond sombre, et blanc chaud (`#FCF6F0`). Elle conserve les
typographies Manrope et DM Sans du projet. FasoCode-X et IObit ont servi
uniquement à repérer des principes généraux de hiérarchie, de rythme visuel,
de démonstration et de navigation au survol ; aucune composition,
illustration, marque ou animation propriétaire n’est reprise.

L’accueil a été allégé : promesse courte, aperçu d’interface interactif,
fonctionnalités, étapes, offres, points de confiance, FAQ courte et appel à
l’action. Les sous-rubriques de « Solutions » apparaissent au survol ou au
focus clavier ; sur mobile, le menu reste ouvrable au toucher. Les cartes de
fonctionnalités s’animent ensemble à leur entrée dans le viewport, puis
réagissent au survol. L’aperçu est identifié comme une démonstration ; aucune
photo, statistique, échéance promotionnelle ou citation client n’est inventée.

## Mouvement et rendu 3D

- GSAP et ScrollTrigger sont importés à la demande sur la seule page d’accueil
  marketing ; chaque animation est créée dans `gsap.context` et revertie au
  démontage.
- La préférence `prefers-reduced-motion` coupe les animations.
- La scène Three.js est chargée à la demande après intersection et seulement
  si WebGL est disponible, si l’économie de données est désactivée et si
  l’appareil ne signale pas une mémoire faible.
- Le rendu est suspendu hors écran et ses ressources WebGL sont libérées au
  démontage. Le repli CSS et l’aperçu restent lisibles sans WebGL.
- Les pages boutique n’importent aucun de ces composants.

## Vérification automatisée

`e2e/marketing-home.spec.ts` couvre le contenu condensé, l’analyse axe WCAG
2.2 AA, l’ouverture du méga-menu au survol et au focus clavier, la FAQ au
clavier, le menu mobile, le changement de métier dans l’aperçu, le repli 3D
sur un appareil simulé à faible mémoire, le budget de JavaScript transféré de
la scène en production et l’absence de débordement à 360 px. Exécuter avec
`pnpm test:e2e -- e2e/marketing-home.spec.ts`.

Le workflow Lighthouse CI inclut l’accueil en émulation mobile et applique le
budget LCP de 2,5 s ainsi que les budgets de performance existants.
La matrice Android d’entrée de gamme, iPhone et ordinateur physiques ainsi que
les essais lecteur d’écran doivent être effectués sur les appareils pilotes ;
ils ne sont pas déclarés comme réalisés par les tests automatisés.
