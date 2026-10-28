# Assurance qualité — Phase 8

## Direction visuelle

La page marketing adopte une identité Faso Studio originale : fond ivoire,
vert profond, accent safran, typographies locales Manrope et DM Sans déjà
présentes dans le projet. La référence IObit a servi uniquement à repérer des
principes généraux de présentation produit, de hiérarchie, de démonstration et
d’appels à l’action ; aucune composition, illustration, marque ou animation
propriétaire n’est reprise.

La page d’accueil présente la promesse, un aperçu produit, les bénéfices, le
parcours en trois étapes, les plans chargés depuis la base, la démarche de
retour pilote, une FAQ et les appels à l’action. Aucun avis client ni résultat
commercial n’est inventé : les témoignages seront ajoutés après accord des
commerces concernés.

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

`e2e/marketing-home.spec.ts` couvre l’essentiel du contenu et des liens,
l’analyse axe WCAG 2.2 AA, l’utilisation de la FAQ au clavier, le repli 3D sur
un appareil simulé à faible mémoire et l’absence de débordement à 360 px.
Exécuter avec `pnpm test:e2e -- e2e/marketing-home.spec.ts`.

Le workflow Lighthouse CI inclut l’accueil en émulation mobile et applique le
budget LCP de 2,5 s ainsi que les budgets de performance existants.
La matrice Android d’entrée de gamme, iPhone et ordinateur physiques ainsi que
les essais lecteur d’écran doivent être effectués sur les appareils pilotes ;
ils ne sont pas déclarés comme réalisés par les tests automatisés.
