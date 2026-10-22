# Cahier des charges : plateforme de boutiques pour commerces locaux (SaaS)

*Version 1.0 · 22 octobre 2026 · Nom du produit : à définir*

## 1. Vision et objectifs

Une plateforme SaaS où chaque commerçant (quincaillerie, pièces détachées, garage, salon de coiffure…) crée sa boutique en quelques minutes, gère son catalogue, ses commandes et ses rendez-vous, et encaisse ses clients par mobile money sur son propre compte marchand. Le revenu de la plateforme vient des abonnements mensuels des commerçants.

Objectifs mesurables du MVP

- Un commerçant crée une boutique publiable en moins de 10 minutes

- Un client commande ou réserve, paiement compris, en moins de 3 minutes

- Pages publiques avec un LCP inférieur à 2,5 s sur une connexion 4G moyenne

- 10 boutiques pilotes actives avant le lancement public

- Aucune donnée d’une boutique accessible à une autre, vérifié par des tests automatisés des politiques RLS

Positionnement : design haut de gamme pour une clientèle équipée de bons smartphones et prête à payer en ligne, avec WhatsApp et le mobile money au cœur du parcours. Le site reste rapide et utilisable sur un téléphone modeste.

## 2. Décisions prises

Sujet

Décision

Modèle

SaaS multi-boutiques, abonnement payant

Paiement des clients

Chaque commerçant connecte son propre compte marchand. La plateforme ne touche jamais cet argent. Au MVP, le mode par défaut est le paiement par code USSD vérifié par le commerçant (4.5).

Abonnements de la plateforme

Paiement par échéance via le compte marchand de la plateforme, sans prélèvement automatique

Accès

Navigation publique recommandée, compte obligatoire pour commander, réserver, payer et laisser un avis (confirmé, voir section 12)

Périmètre MVP

Mobile money, rendez-vous avec créneaux, abonnements, promotions, avis, mode hors connexion partiel

Stack

Next.js (App Router) + TypeScript, Cloudflare, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), Resend, react-hook-form, GSAP + ScrollTrigger, Three.js

## 3. Rôles

- Visiteur : parcourt l’annuaire et les boutiques publiques

- Client : compte créé, peut commander, réserver, payer, noter, suivre ses commandes et rendez-vous

- Commerçant (propriétaire) : gère sa boutique, son abonnement, ses paiements, son équipe

- Employé de boutique : accès limité défini par le propriétaire (commandes, rendez-vous, produits)

- Admin plateforme : valide les boutiques, modère, gère les plans et les litiges

## 4. Spécifications fonctionnelles

### 4.1 Comptes et authentification

- Inscription et connexion par e-mail et mot de passe, magic link, OAuth (Google au minimum)

- Vérification de l’e-mail obligatoire avant toute action sensible

- Réinitialisation du mot de passe, changement d’e-mail, suppression du compte

- Numéro de téléphone obligatoire au moment de la première commande ou réservation (format burkinabè validé)

- Sessions à durée limitée, déconnexion sur tous les appareils

### 4.2 Boutiques

- Création guidée : nom, adresse unique (nom.tondomaine.com), catégorie, logo, couleur principale, numéro WhatsApp, quartier et ville, horaires, localisation sur la carte

- Statuts : brouillon, en attente de validation, publiée, suspendue

- Page boutique publique : présentation, catalogue, services, avis, horaires, carte, boutons Appeler et WhatsApp

- Équipe : invitation d’employés par e-mail avec rôle

- Domaine personnalisé : hors MVP, prévu en V2

### 4.3 Catalogue

- Catégories hiérarchiques par boutique

- Produits : nom, description, prix en FCFA (entier), photos multiples, stock optionnel, statut (disponible, rupture, masqué), variantes simples (taille, modèle), référence ou compatibilité pour les pièces détachées

- Services : nom, description, durée, prix, photos (coiffures, prestations de garage)

- Recherche plein texte dans la boutique et dans l’annuaire (Postgres full-text, sans accents)

- Import en masse par fichier CSV pour les commerçants qui ont beaucoup de références

- Upload des images : compression et conversion WebP côté client, taille et types limités, plusieurs tailles générées pour l’affichage

### 4.4 Panier et commandes

- Panier lié au compte client, un panier par boutique

- Récapitulatif avec code promo, mode de retrait (en boutique ou livraison à l’adresse indiquée, livraison gérée par le commerçant)

- Cycle de vie (détail et règles en 4.15, avec le statut payment_declared pour l’USSD) : pending_payment, paid, confirmed, ready, completed, cancelled, refunded

- Option de commande sans paiement en ligne (paiement à la livraison ou au retrait), activable par le commerçant

- Message WhatsApp prérempli envoyé au commerçant en complément, pas à la place de la commande enregistrée

- Notifications en temps réel au commerçant (Supabase Realtime) et par e-mail (Resend)

### 4.5 Paiement mobile money (compte marchand du commerçant)

- Mode automatique, activé après vérification (voir plus bas) : le commerçant connecte son compte chez un agrégateur pris en charge (Ligdicash, CinetPay ou pawaPay, choix final à valider) depuis son tableau de bord

- Ses clés API sont stockées chiffrées (Supabase Vault ou chiffrement applicatif) et ne sont lisibles que par les Edge Functions, jamais par le navigateur

- Une couche d’abstraction PaymentProvider isole chaque agrégateur : créer un paiement, vérifier un statut, traiter un webhook, rembourser si l’API le permet

- Flux : le serveur crée la transaction avec les clés de la boutique, le client valide sur son téléphone (redirection ou validation USSD), l’agrégateur appelle un webhook, le serveur vérifie la signature et re-vérifie le statut auprès de l’agrégateur avant de marquer la commande payée

- Idempotence : une référence unique par tentative, aucun double débit ni double validation

- Gestion des échecs fréquents : solde insuffisant, réseau indisponible, plafond dépassé, expiration, avec messages clairs et bouton Réessayer

- Les plafonds par transaction varient selon l’opérateur et sont affichés au commerçant

- La plateforme ne prélève aucune commission sur ces paiements

Mode USSD (paiement manuel), mode par défaut du MVP

Le paiement par code USSD fonctionne sans compte marchand chez un agrégateur : le client paie depuis son téléphone vers le numéro ou le code marchand du commerçant, et le commerçant vérifie lui-même la réception.

- Le commerçant renseigne dans son tableau de bord son numéro Orange Money et ou Moov, ou son code marchand, et le modèle de code USSD de son opérateur (les codes exacts viennent de l’opérateur, ils ne sont jamais codés en dur)

- Au paiement, le client voit le montant exact, le numéro ou code à payer et une référence de commande courte (par exemple CMD-4F7K) ; un bouton ouvre le composeur avec le code USSD prérempli (lien tel:, à tester sur Android et iPhone), sinon le code s’affiche avec un bouton Copier

- Après paiement, le client saisit la référence de transaction reçue par SMS et le numéro qui a payé ; une capture d’écran du SMS est facultative (bucket privé, taille limitée)

- La commande passe à payment_declared et le commerçant est notifié aussitôt

- Le commerçant compare montant, numéro et référence avec son propre historique Orange Money ou Moov, puis confirme ou rejette (motif obligatoire) ; le client peut corriger une fois une référence rejetée

- Une même référence de transaction ne peut pas servir à deux commandes (contrainte d’unicité par boutique)

- Aucune vérification automatique n’est possible : le risque de fausse référence existe. Un plafond de montant configurable limite l’exposition en mode manuel, et le retrait avec paiement en boutique reste proposé pour les gros achats

- Responsabilité : la plateforme ne touche pas l’argent et ne garantit pas le paiement ; la vérification incombe au commerçant, ce qui est écrit dans les CGU et rappelé dans l’interface

Mode agrégateur automatique, activé quand les conditions sont confirmées

À vérifier par écrit auprès de chaque agrégateur avant de coder : (1) un commerçant peut-il utiliser ses propres identifiants API dans une plateforme tierce selon leurs conditions, ou faut-il un statut de partenaire ou de sous-marchand ; (2) documents et frais demandés au commerçant ; (3) sandbox ; (4) webhooks signés ; (5) remboursements ; (6) plafonds par transaction. Constat à ce jour : les sources publiques indiquent que le commerçant doit fournir ses documents d’identification (KYC) et intégrer l’API, et le SDK de CinetPay fonctionne avec une clé et un mot de passe d’API par pays. Rien n’est documenté publiquement sur l’usage de ces identifiants par une plateforme tierce, d’où la question à poser. Tant que ce point n’est pas confirmé, le paiement USSD reste le mode principal.

### 4.6 Rendez-vous et réservations

- Le commerçant définit : horaires d’ouverture par jour, pauses, jours fermés, durée par service, délai minimal de réservation, délai d’annulation, ressources ou employés (optionnel)

- Le client voit uniquement les créneaux réellement libres, choisit un service, un créneau, et confirme

- Acompte optionnel par mobile money pour limiter les rendez-vous manqués

- Anti double-réservation garanti par la base de données (contrainte d’exclusion Postgres, voir section 6)

- Statuts : pending, confirmed, cancelled, completed, no_show

- Rappels automatiques par e-mail (J-1 et 2 h avant), avec lien d’annulation ou de report

- Vue calendrier pour le commerçant (jour, semaine)

- Fuseau : Africa/Ouagadougou (UTC+0, sans changement d’heure)

### 4.7 Abonnements de la plateforme

Plan

Contenu (à ajuster)

Gratuit

Nombre limité de produits, pas de rendez-vous, mention de la plateforme

Pro

Produits illimités, rendez-vous, promotions, statistiques

Premium

Pro + domaine personnalisé (V2), support prioritaire, équipe étendue

- Paiement par période (mensuel, avec option trimestriel ou annuel à tarif réduit)

- Pas de prélèvement automatique : la facture est émise avant l’échéance, le commerçant paie par mobile money via un lien

- Rappels à J-7, J-3 et J0 par e-mail et notification dans le tableau de bord

- Période de grâce de 7 jours, puis rétrogradation automatique au plan Gratuit sans suppression des données (les produits au-delà de la limite sont masqués, pas effacés)

- Reçus et historique de facturation téléchargeables en PDF

- Tâches planifiées par Edge Functions ou pg_cron

- Les limites de chaque plan sont appliquées côté base de données et côté serveur, jamais seulement dans l’interface

### 4.8 Promotions

- Codes promo : pourcentage ou montant fixe, dates de début et de fin, montant minimal, limite d’usage globale et par client, produits ou catégories ciblés

- Prix barrés et produits en promotion, avec badge sur la vitrine

- Calcul des remises uniquement côté serveur, jamais fait confiance au navigateur

### 4.9 Avis clients

- Seuls les clients ayant une commande ou un rendez-vous terminé peuvent noter (avis vérifié), un avis par commande ou rendez-vous

- Note de 1 à 5, commentaire, photos optionnelles

- Réponse publique du commerçant

- Signalement et modération par l’admin

- La note moyenne et le nombre d’avis sont maintenus par trigger pour un affichage rapide

### 4.10 Annuaire public et SEO

- Recherche par ville, quartier, catégorie, avec filtres (ouvert maintenant, note, promotions)

- Pages boutiques rendues côté serveur avec métadonnées, données structurées (LocalBusiness, Product, AggregateRating) et sitemap automatique

- Partage : liens courts de produit ou de boutique avec aperçu riche (image Open Graph) pour WhatsApp et réseaux sociaux

### 4.11 Tableau de bord commerçant

- Vue d’ensemble : commandes du jour, rendez-vous du jour, chiffre d’affaires, produits les plus vus, avis récents

- Gestion des commandes, rendez-vous, produits, services, promotions, avis, équipe, paiements, abonnement, paramètres

- Utilisable sur téléphone comme sur ordinateur

### 4.12 Administration plateforme

- Validation et suspension des boutiques, modération des avis et des contenus

- Gestion des plans, statistiques globales, journal d’audit

- Outil de support : voir une boutique en lecture seule, avec traçabilité de chaque accès

### 4.13 Hors connexion partiel (PWA)

- Application installable, service worker (Serwist ou équivalent compatible)

- Disponible sans réseau : pages et catalogue déjà consultés, panier, commandes et rendez-vous déjà chargés, en lecture seule

- Bannière claire quand l’utilisateur est hors ligne, actions d’écriture et de paiement désactivées avec explication

- Mise à jour automatique du cache quand le réseau revient

- Hors MVP : écriture hors ligne avec synchronisation différée

### 4.14 Mise en route du commerçant

Objectif : une boutique publiable en moins de 10 minutes, mesuré de l’inscription à la publication sur la médiane des boutiques pilotes.

1. Inscription : e-mail, Google ou magic link, e-mail vérifié

2. Type de commerce : quincaillerie, pièces détachées, garage, salon ou autre ; ce choix préconfigure les catégories, le vocabulaire (produits ou services) et les exemples

3. Identité : nom, adresse de la boutique avec vérification de disponibilité en direct, logo facultatif (avatar généré à partir des initiales sinon), couleur

4. Contact et lieu : numéro WhatsApp avec envoi de test, téléphone, quartier, horaires, épingle sur la carte

5. Premiers produits ou services : ajout depuis la photo du téléphone, import CSV, ou exemples prêts à modifier selon le type de commerce (marqués « Exemple », jamais publiés tant qu’ils ne sont pas modifiés ou validés)

6. Encaissement : paiement USSD par défaut (numéro et code à saisir), paiement à la livraison ou au retrait, agrégateur plus tard

7. Prévisualisation : aperçu de la vitrine sur téléphone et ordinateur tel que le client la verra, avec un bandeau « Aperçu, pas encore publié »

8. Publication : un seul bouton, sous réserve de la validation administrateur (délai maximal de 24 h ; la décision, acceptée ou refusée avec motif et possibilité de corriger puis de soumettre à nouveau, est notifiée par e-mail et dans le tableau de bord) ; la boutique reçoit son lien, un QR code et un message WhatsApp prérédigé à partager

Brouillon et reprise

- Chaque champ est enregistré automatiquement environ 1 seconde après la dernière saisie, avec un indicateur « Enregistré »

- Si la connexion coupe, la saisie reste dans le navigateur et se synchronise au retour du réseau ; seul le brouillon fonctionne ainsi, jamais un paiement

- Le commerçant reprend à l’étape où il s’est arrêté, depuis n’importe quel appareil, avec une checklist de ce qui manque pour publier (nom, adresse, WhatsApp, au moins un produit ou service, un mode d’encaissement)

Aide à chaque étape

- Bouton « Besoin d’aide ? » toujours visible : ouvre WhatsApp vers le numéro du support avec un message prérempli (identifiant de la boutique et étape en cours), et un formulaire e-mail en secours

- Vidéo de moins d’une minute par étape et centre d’aide court en français

- Pour les pilotes, mise en route accompagnée en direct

Mesures : temps total, abandon par étape et demandes d’aide par étape, pour corriger les étapes qui bloquent.

### 4.15 Statuts et transitions

Le diagramme montre le cycle de vie d’une commande ; les règles ci-dessous s’appliquent dans la base de données et les Edge Functions, jamais seulement dans l’interface.

cycle de vie d’une commande · 8 statuts

Un rejet du commerçant ramène la commande à pending_payment une seule fois, pour corriger la référence. L’annulation après paiement ouvre un remboursement : le schéma la montre depuis paid, elle reste possible depuis confirmed et ready.

Commandes

Règle

Décision

Annulation automatique de pending_payment

Oui. Paiement en ligne : 30 minutes. USSD : 2 heures pour déclarer le paiement, réglable de 1 à 24 heures par le commerçant. Le stock réservé est libéré.

payment_declared sans réponse du commerçant

Jamais annulée automatiquement, car le client a peut-être payé. Rappel au commerçant après 2 heures et 24 heures, puis alerte à l’administrateur après 72 heures.

Marquer une commande payée manuellement

Oui pour l’USSD, le paiement à la livraison et le paiement en boutique, par le propriétaire ou un employé autorisé. Action journalisée (auteur, date, référence). Interdit pour un paiement par agrégateur : seul un webhook vérifié change ce statut.

Annulation par le client

Possible tant que la commande n’est pas confirmed. Ensuite, il demande au commerçant.

Annulation par le commerçant

Possible jusqu’à ready, avec motif obligatoire ; si la commande est payée, un remboursement est ouvert.

Remboursement

Déclenché uniquement par le commerçant (propriétaire ou employé avec permission) ou par l’administrateur en cas de litige. Paiement USSD : le commerçant rembourse hors plateforme et saisit la référence. Agrégateur : via l’API si elle le permet, sinon manuel.

Statuts finaux

completed, cancelled, refunded : aucune transition ensuite.

Rendez-vous

Règle

Décision

Confirmation

Automatique ou manuelle, au choix du commerçant pour chaque service

Annulation par le client

Jusqu’à un délai fixé par le commerçant (par exemple 24 heures avant) ; l’acompte est remboursé ou conservé selon cette règle, affichée avant la réservation

Absence du client

Le commerçant marque no_show après le créneau

Abonnements

Règle

Décision

active vers past_due

À l’échéance sans paiement

past_due vers expired

Après 7 jours de grâce, avec rétrogradation au plan Gratuit

Retour à active

Dès réception du paiement, sans perte de données

## 5. Architecture technique

- Frontend : Next.js (App Router) + TypeScript strict, Tailwind, react-hook-form + Zod, composants serveur par défaut

- Hébergement : Cloudflare (adaptateur OpenNext, compatibilité à vérifier avec la version de Next.js choisie), CDN et cache pour les pages publiques

- Backend : Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), e-mails transactionnels par Resend

- Routage multi-boutiques : sous-domaine par boutique résolu par middleware, ou chemin /b/nom en secours

- Edge Functions : création de paiement, webhooks, génération de factures, rappels planifiés, calcul des remises, anti-spam

- Qualité : tests unitaires (Vitest), tests des politiques RLS (pgTAP ou scripts SQL), tests de bout en bout (Playwright) sur les parcours commande, paiement et réservation

- Environnements : développement, préproduction, production, avec migrations versionnées (Supabase CLI)

- Observabilité : suivi d’erreurs (Sentry ou équivalent), journaux des webhooks de paiement, alertes sur les échecs

## 6. Modèle de données

Règles générales : clés uuid, horodatages timestamptz, montants en entiers FCFA (pas de décimales), suppression logique quand nécessaire, shop_id sur toute table liée à une boutique, RLS activée partout.

Identité et boutiques

- profiles : id (= auth.users.id), full_name, phone, avatar_url, role_global (customer ou admin)

- shops : id, slug unique, name, description, category, logo_url, brand_color, whatsapp, phone, city, district, address, lat, lng, opening_hours (jsonb), status, rating_avg, rating_count

- shop_members : shop_id, user_id, role (owner, staff), permissions (jsonb)

- shop_payment_accounts : shop_id, provider, credentials_encrypted, webhook_secret_encrypted, status (clés jamais exposées au client)

Catalogue

- categories : id, shop_id, parent_id, name, position

- products : id, shop_id, category_id, name, description, price, compare_at_price, sku, stock, status, search_vector

- product_variants : id, product_id, name, price, stock

- product_images : id, product_id, path, position

- services : id, shop_id, name, description, duration_min, price, deposit_amount, active

Commandes et paiements

- carts, cart_items

- orders : id, shop_id, customer_id, status, subtotal, discount, total, coupon_id, fulfillment (pickup ou delivery), delivery_address, note

- order_items : order_id, product_id, variant_id, name_snapshot, unit_price, quantity

- payments : id, shop_id, order_id ou booking_id, provider, provider_ref, idempotency_key unique, amount, status (initiated, pending, succeeded, failed, expired, refunded), raw_webhook (jsonb)

- webhook_events : id, provider, event_id unique, payload, processed_at (évite le double traitement)

Ajouts liés aux décisions récentes (USSD, mise en route, validation, statuts)

- shop_payment_methods : shop_id, type (ussd_orange, ussd_moov, cash_on_delivery, pay_at_pickup, aggregator), phone_or_code, ussd_template, max_amount, active

- payment_declarations : id, order_id, payer_phone, transaction_ref, screenshot_path, status (declared, confirmed, rejected), reviewed_by, reviewed_at, reject_reason ; contrainte d’unicité sur (shop_id, transaction_ref)

- orders : ajout du statut payment_declared, de payment_method et de expires_at (annulation automatique de pending_payment)

- order_status_history : order_id, from_status, to_status, actor_id, note, created_at (trace de chaque transition)

- shop_onboarding : shop_id, current_step, draft (jsonb), updated_at (brouillon enregistré automatiquement)

- shops : ajout de review_status (draft, submitted, approved, rejected), submitted_at, reviewed_by, rejection_reason pour la validation sous 24 h

- products, services, reviews : ajout de deleted_at (corbeille de 30 jours)

Rendez-vous

- availability_rules : shop_id, resource_id, weekday, start_time, end_time

- time_off : shop_id, resource_id, starts_at, ends_at, reason

- resources : id, shop_id, name (employé ou poste)

- bookings : id, shop_id, service_id, resource_id, customer_id, during tstzrange, status, deposit_payment_id

- Contrainte clé : EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (status IN ('pending','confirmed')) avec l’extension btree_gist

Plateforme

- plans : id, code, name, price_monthly, limits (jsonb), features (jsonb)

- subscriptions : shop_id, plan_id, status (active, past_due, expired), current_period_end, grace_until

- invoices : id, shop_id, subscription_id, amount, status, due_at, paid_at, payment_ref, pdf_path

Engagement

- coupons : id, shop_id, code, type, value, min_amount, starts_at, ends_at, max_uses, per_customer_limit, scope (jsonb), active

- coupon_redemptions : coupon_id, customer_id, order_id

- reviews : id, shop_id, customer_id, order_id ou booking_id (unique), rating, comment, status, shop_reply

- notifications : id, user_id, type, payload, read_at

- audit_log : id, actor_id, shop_id, action, entity, entity_id, metadata, created_at

Principes RLS

- Un client lit et modifie uniquement ses propres commandes, rendez-vous et avis

- Un membre de boutique accède uniquement aux lignes dont shop_id correspond à une de ses boutiques

- Lecture publique limitée aux boutiques publiées et aux produits non masqués, via des vues sans colonnes sensibles

- Écritures sensibles (paiements, abonnements, remises, statuts) réservées aux Edge Functions avec service_role

- Chaque politique est couverte par un test automatisé

## 7. Sécurité

Exigence

Mise en œuvre

Mots de passe

Gérés et hachés par Supabase Auth, jamais manipulés par l’application

Rate limiting connexion

Limites Supabase Auth, règles de rate limiting Cloudflare sur les routes d’authentification, Turnstile sur inscription et connexion

CSRF

Cookies httpOnly, Secure, SameSite=Lax via @supabase/ssr, vérification de l’en-tête Origin sur les requêtes qui modifient des données, aucun jeton en localStorage

Sessions

JWT à durée courte, rotation des refresh tokens, expiration d’inactivité (options selon le plan Supabase, à vérifier)

Validation des entrées

Schémas Zod partagés client et serveur, contraintes CHECK et types stricts en base

Uploads

Limite de taille et types MIME par bucket, vérification côté serveur, noms de fichiers générés, buckets privés pour les documents

CORS

Liste blanche d’origines dans chaque Edge Function

Limite de requêtes

Règles WAF Cloudflare par IP, compteurs par utilisateur dans les Edge Functions sensibles (commande, paiement, réservation, avis)

Secrets

service_role et clés de paiement uniquement côté serveur, jamais dans le bundle

Paiements

Vérification de signature des webhooks, re-vérification du statut, idempotence, journal complet

En-têtes

CSP stricte, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

Données personnelles

Minimisation, export et suppression sur demande, politique de confidentialité et CGU rédigées avec un juriste local

Sauvegardes

Sauvegardes Supabase planifiées, test de restauration avant le lancement

Sauvegarde et restauration

Objectifs de départ : perte de données maximale (RPO) de 15 minutes si la restauration à un instant précis est disponible sur le plan choisi, sinon 24 heures ; remise en service (RTO) en moins de 4 heures. À valider selon ce que le plan Supabase retenu inclut réellement.

Couches de sauvegarde

- Base de données : sauvegardes quotidiennes automatiques de Supabase, plus la restauration à un instant précis si disponible (inclusion ou option payante à vérifier)

- Copie indépendante : export quotidien chiffré de la base vers un stockage séparé de Supabase (par exemple Cloudflare R2), conservé 30 jours en quotidien puis 12 mois en mensuel

- Fichiers : copie régulière des buckets Storage (photos de produits, logos) vers le même stockage séparé

- Code : dépôt Git, déploiements Cloudflare versionnés avec retour arrière en quelques minutes

- Configuration : migrations SQL versionnées (Supabase CLI) et configuration Cloudflare dans le dépôt

- Secrets : gestionnaire de mots de passe, copie chiffrée hors ligne, procédure de rotation écrite

- Suppression logique côté application : corbeille de 30 jours pour produits, services et avis

Scénarios et réponses

Scénario

Détection

Réponse

Un commerçant supprime ses produits par erreur

Demande du commerçant

Restauration depuis la corbeille ; au-delà de 30 jours, restauration ciblée depuis une sauvegarde dans une base temporaire, puis réinjection

Migration SQL défectueuse

Erreurs après déploiement, alertes

Sauvegarde avant chaque migration, test préalable en préproduction ; retour par restauration ou migration inverse

Perte ou corruption de la base, incident chez le fournisseur

Alertes de disponibilité

Restauration vers un nouveau projet Supabase depuis la sauvegarde ou la copie indépendante, mise à jour des clés et des URL, remise en service sous 4 heures

Mauvais déploiement du site

Alertes d’erreurs, surveillance

Retour à la version précédente sur Cloudflare

Fichiers Storage perdus ou écrasés

Images manquantes signalées

Restauration depuis la copie indépendante

Clé compromise (service_role, clé de paiement, secret de webhook)

Alerte ou activité anormale

Rotation immédiate, révocation des sessions, consultation du journal d’audit, information des commerçants concernés

Compte administrateur ou propriétaire piraté

Connexion inhabituelle

Authentification à deux facteurs obligatoire pour les administrateurs et conseillée aux propriétaires, révocation des sessions, journal d’audit

Webhooks de paiement manqués pendant une panne

Commandes bloquées en attente

Tâche de réconciliation planifiée qui interroge l’agrégateur pour les commandes en attente des 48 dernières heures

Panne prolongée d’un fournisseur

Page de statut

Mode lecture seule grâce au cache hors connexion, message aux commerçants par WhatsApp et e-mail

Tests et suivi

- Exercice de restauration complète avant le lancement, puis chaque trimestre, consigné dans un guide d’exploitation (runbook)

- Alerte si une sauvegarde échoue ou n’a pas tourné depuis plus de 24 heures

- Les sauvegardes sont chiffrées ; une demande de suppression de données personnelles s’applique aussi aux sauvegardes à l’expiration de leur durée de conservation, mentionnée dans la politique de confidentialité

## 8. Performance

- Pages publiques servies depuis le cache Cloudflare avec revalidation à la modification (ISR ou tags)

- Images en WebP ou AVIF, tailles multiples, chargement différé, dimensions réservées pour éviter les décalages

- JavaScript initial réduit au minimum sur les pages boutique ; GSAP et Three.js chargés uniquement là où ils servent, via import dynamique

- Three.js limité à quelques moments forts (page d’accueil de la plateforme, éventuellement visualisation de produit), avec image de remplacement si l’appareil est faible, si l’économie de données est active ou si l’utilisateur demande de réduire les animations

- Animations limitées à transform et opacity, respect de prefers-reduced-motion

- Objectifs : LCP inférieur à 2,5 s, INP inférieur à 200 ms, CLS inférieur à 0,1, mesurés régulièrement

## 9. Direction design

Trois surfaces, trois ambiances, un même système :

- Site de la plateforme (pour recruter les commerçants) : la vitrine la plus expressive, avec animations au scroll GSAP et un moment fort Three.js

- Vitrines des boutiques (pour les clients) : élégantes, rapides, personnalisables par couleur et logo, avec des animations sobres qui répondent aux actions

- Tableau de bord (pour le travail quotidien) : clair, dense quand il le faut, très lisible sur téléphone

Exigences : système de design à jetons (couleurs, typographie, espacements), thème clair et sombre, accessibilité (contraste, focus visible, navigation clavier), français simple, états vides et erreurs rédigés pour guider l’utilisateur. La direction visuelle précise (palette, typographies, maquettes) sera définie en phase 0 avant d’écrire l’interface.

Ordre de travail : chaque phase se termine par un test avec de vrais commerçants et clients pilotes avant de passer à la suivante.

## 11. Risques et réponses

- Paiement : conditions d’ouverture d’un compte marchand, plafonds et délais de règlement variables selon l’opérateur. Réponse : démarrer les démarches dès la phase 0, prévoir le paiement à la livraison comme alternative.

- Acquisition des commerçants : construire ne suffit pas. Réponse : boutiques pilotes dès la phase 2, service de mise en route payant pour les premiers clients.

- Périmètre trop large : Réponse : phases courtes, démonstrations régulières, fonctionnalités V2 strictement séparées.

- Dépendance à des services étrangers (Cloudflare, Supabase, Resend) : règlement depuis le Burkina à prévoir à l’avance (carte virtuelle ou autre moyen), coûts à surveiller.

- Support : les commerçants veulent une réponse rapide sur WhatsApp. Réponse : numéro de support dédié et centre d’aide court en vidéo.

- Conformité : protection des données, CGU, mentions légales, facturation. Réponse : consulter un juriste local avant le lancement.

## 12. Décisions validées et points restants

Décisions validées le 22 octobre 2026 :

1. Navigation publique : catalogue, boutiques et avis visibles sans compte ; compte obligatoire pour commander, réserver, payer et noter, avec retour à la page d’origine après une connexion rapide.

2. Agrégateur de paiement : deux demandes d’ouverture de compte en phase 0, un seul agrégateur développé d’abord, choisi sur la sandbox, les webhooks signés, l’API de statut, les remboursements et la facilité d’ouverture pour un commerçant. Un mode de repli « paiement manuel » est inclus dans le MVP : numéro Orange Money ou Moov affiché, référence saisie par le client, confirmation par le commerçant.

3. Compte marchand de la plateforme : démarches à lancer dès maintenant ; vérifier avec les agrégateurs et un comptable local si une entreprise enregistrée est nécessaire.

4. Next.js sur Cloudflare : faisable avec OpenNext (App Router, ISR, middleware et Server Actions pris en charge ; middleware Node.js non pris en charge). Test de deux jours en début de phase 0 : sous-domaines, authentification par cookies, page en cache.

5. Sessions : plan Supabase Pro dès les boutiques pilotes, développement sur le plan gratuit. Valeurs de départ : JWT d’1 heure, expiration après 7 jours d’inactivité, durée maximale de 30 jours, nouvelle authentification pour les actions sensibles.

6. Tarifs de départ à tester : Gratuit 0 FCFA (15 produits, sans rendez-vous), Pro 7 500 FCFA/mois, Premium 15 000 FCFA/mois, deux mois offerts pour un paiement annuel, 3 mois gratuits pour les 10 pilotes.

7. Nom et domaine : nom court, sans accent, .com et réseaux sociaux disponibles ; moyen de paiement international (carte virtuelle ou tiers de confiance) à prévoir.

8. WhatsApp : liens wa.me préremplis et e-mails au MVP, API WhatsApp Business en V2.

À vérifier encore : conditions réelles d’ouverture de compte marchand chez chaque agrégateur, frais et plafonds, options de session incluses dans le plan Supabase Pro, cadre légal et fiscal local.

Décision complémentaire du 22 octobre 2026 : le paiement par code USSD (mode manuel, section 4.5) est le mode d’encaissement principal du MVP. L’agrégateur automatique s’ajoute quand le point sur l’usage des identifiants du commerçant par la plateforme est confirmé par écrit par le fournisseur.

Publication des boutiques (décision du 22 octobre 2026) : toute boutique passe par une validation administrateur sous 24 h. L’administrateur vérifie le nom, le logo, les photos, les coordonnées, les produits ou services (hors exemples non modifiés) et la conformité aux CGU. Une alerte est envoyée à l’administrateur pour toute demande en attente depuis plus de 12 h, afin de tenir le délai. Pendant l’attente, la boutique reste en brouillon et l’aperçu reste accessible au commerçant.

## 13. Prochaines étapes

1. Lancer les démarches des comptes marchands (plateforme et agrégateurs) et choisir le nom du produit

2. Phase 0 : direction design et maquettes

3. Écrire le script SQL initial (tables, index, contraintes, RLS, tests)

4. Initialiser le projet Next.js et Supabase avec l’authentification et la sécurité de base
