# Démarches auprès des fournisseurs de paiement

## État

Aucun fournisseur n’est validé pour l’intégration. Le paiement automatique reste désactivé (`PAYMENT_AGGREGATOR_ENABLED=false`) et aucun adaptateur réel ne doit être ajouté avant d’avoir consigné ici les réponses écrites et vérifié une sandbox.

## Questions à confirmer par écrit

Pour chaque fournisseur envisagé (Ligdicash, CinetPay, pawaPay ou autre) :

- La plateforme peut-elle intégrer les identifiants API appartenant à chaque commerçant, ou faut-il un contrat partenaire, un compte plateforme ou un statut de sous-marchand ?
- Quels documents KYC et quelles étapes d’ouverture sont exigés du commerçant et de la plateforme ?
- Une sandbox est-elle disponible, avec quels parcours et données de test ?
- Comment les signatures webhook sont-elles calculées et renouvelées ? Existe-t-il un identifiant d’événement stable pour la déduplication ?
- Quel endpoint permet de re-vérifier côté serveur le statut final, le montant, la devise et la référence d’une transaction ?
- Quelles devises, opérateurs et limites de montant sont couverts au Burkina Faso ?
- Les remboursements sont-ils disponibles par API, partiels ou complets, et quelles références faut-il conserver ?
- Quels sont les frais, délais de règlement, plafonds et responsabilités en cas de litige ou de transaction contestée ?

## Conditions de déblocage

Avant d’activer un adaptateur :

1. Archiver la réponse écrite de chaque fournisseur et noter la date, le canal de réponse et le contact autorisé.
2. Vérifier les parcours de création, statut, webhook rejoué, signature invalide, expiration, remboursement et réconciliation dans la sandbox.
3. Ajouter les seules conclusions utiles à cette page, sans y copier de clé, secret ou donnée personnelle.
4. Chiffrer les identifiants au serveur, exiger une réauthentification pour leur saisie ou rotation, et confirmer qu’ils ne sont lisibles que par les Edge Functions.
5. Faire approuver l’activation du drapeau séparément du déploiement de l’adaptateur.
