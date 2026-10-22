-- =====================================================================
-- Tests pgTAP : RLS, droits, machine a etats, anti double-reservation,
-- avis, promotions, validation des boutiques, storage.
-- Lancer : supabase test db      (les identifiants ci-dessous sont fictifs)
-- =====================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set time zone 'UTC';
select * from no_plan();

-- ---------- Outils de test ----------
create schema tests;
grant usage on schema tests to public;
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

create function tests.as_user(p uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function tests.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
end $$;
create function tests.as_service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
end $$;
create function tests.as_postgres() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
create function tests.v(p_k text) returns text language sql stable as $$ select v from ctx where k = p_k $$;
grant execute on all functions in schema tests to public;

-- ---------- Donnees de depart (en superutilisateur) ----------
-- admin a...01 | m1 a...02 (proprio boutique 1, plan pro) | m2 a...03 (proprio boutiques 2 et 3, plan gratuit)
-- s1 a...04 (employe, droit commandes) | s2 a...05 (employe sans droits) | c1 a...06, c2 a...07 (clients)
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.bf', '{"full_name":"Admin Plateforme"}'),
  ('a0000000-0000-0000-0000-000000000002', 'm1@test.bf',    '{"full_name":"Moussa Traore"}'),
  ('a0000000-0000-0000-0000-000000000003', 'm2@test.bf',    '{"full_name":"Mariam Kone"}'),
  ('a0000000-0000-0000-0000-000000000004', 's1@test.bf',    '{"full_name":"Staff Un"}'),
  ('a0000000-0000-0000-0000-000000000005', 's2@test.bf',    '{"full_name":"Staff Deux"}'),
  ('a0000000-0000-0000-0000-000000000006', 'c1@test.bf',    '{"full_name":"Awa Ouedraogo"}'),
  ('a0000000-0000-0000-0000-000000000007', 'c2@test.bf',    '{"full_name":"Issa Sawadogo"}');
update public.profiles set role_global = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set phone = '+22670000006' where id = 'a0000000-0000-0000-0000-000000000006';
update public.profiles set phone = '+22670000007' where id = 'a0000000-0000-0000-0000-000000000007';

insert into public.shops (id, created_by, slug, name, whatsapp, review_status) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'quincaillerie-test', 'Quincaillerie Test', '+22670111111', 'approved'),
  ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'garage-test',        'Garage Test',        '+22670222222', 'approved'),
  ('50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'brouillon-test',     'Brouillon Test',     null,           'draft');
update public.subscriptions set plan_id = (select id from public.plans where code = 'pro')
  where shop_id = '50000000-0000-0000-0000-000000000001';
insert into public.shop_members (shop_id, user_id, role, permissions) values
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'staff', '{"orders": true}'),
  ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'staff', '{}');
insert into public.shop_payment_methods (shop_id, type, phone_or_code) values
  ('50000000-0000-0000-0000-000000000001', 'ussd_orange', '+22670111111'),
  ('50000000-0000-0000-0000-000000000001', 'cash_on_delivery', null),
  ('50000000-0000-0000-0000-000000000002', 'ussd_moov', '+22670222222');
insert into public.products (id, shop_id, name, price, stock, status) values
  ('b0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Marteau',  5000,  10,   'available'),
  ('b0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'Peinture', 15000, null, 'available'),
  ('b0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'Cache',    1000,  null, 'hidden'),
  ('b0000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', 'Plaquettes', 20000, null, 'available');
insert into public.services (id, shop_id, name, duration_min, price) values
  ('c0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Coupe', 60, 5000),
  ('c0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Vidange', 60, 15000);
insert into ctx select 'r1', id::text from public.resources where shop_id = '50000000-0000-0000-0000-000000000001';
insert into ctx select 'r2', id::text from public.resources where shop_id = '50000000-0000-0000-0000-000000000002';
insert into public.availability_rules (shop_id, resource_id, weekday, start_time, end_time)
  select s.shop_id, s.rid, d, '08:00', '18:00'
  from (values ('50000000-0000-0000-0000-000000000001'::uuid, tests.v('r1')::uuid),
               ('50000000-0000-0000-0000-000000000002'::uuid, tests.v('r2')::uuid)) s(shop_id, rid),
       generate_series(0, 6) d;
-- Un lundi a 09:00 (heure locale du Burkina = UTC), entre 14 et 21 jours dans le futur.
insert into ctx values ('mon9', (date_trunc('week', now() + interval '14 days') + interval '7 days' + interval '9 hours')::text);

-- =====================================================================
-- A. Visiteur anonyme
-- =====================================================================
select tests.as_anon();
select is((select count(*) from public.shops), 2::bigint, 'anon : seules les boutiques approuvees sont visibles');
select is((select count(*) from public.products where shop_id = '50000000-0000-0000-0000-000000000001'), 2::bigint, 'anon : les produits masques sont invisibles');
select throws_ok('select * from public.orders', '42501', null, 'anon : lecture des commandes interdite');
select throws_ok('select * from public.bookings', '42501', null, 'anon : lecture des reservations interdite');
select throws_ok('select * from public.shop_payment_accounts', '42501', null, 'anon : identifiants agregateur interdits');
select throws_ok('select * from public.shop_payment_methods', '42501', null, 'anon : modes de paiement reserves aux connectes');
select throws_ok('select * from public.webhook_events', '42501', null, 'anon : webhooks interdits');
select throws_ok('select customer_id from public.reviews', '42501', null, 'anon : customer_id des avis masque');
select throws_ok($$select public.transition_order(gen_random_uuid(), 'paid')$$, '42501', null, 'anon : RPC interdites');

-- =====================================================================
-- B. Profils
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok($$update public.profiles set role_global = 'admin' where id = 'a0000000-0000-0000-0000-000000000006'$$, '42501', null, 'un client ne peut pas se donner le role admin');
select is((select count(*) from public.profiles), 1::bigint, 'un client ne voit que son propre profil');
select lives_ok($$update public.profiles set phone = '+22670000006' where id = 'a0000000-0000-0000-0000-000000000006'$$, 'un client modifie son telephone');

-- =====================================================================
-- C. Creation de boutique et limites du plan gratuit
-- =====================================================================
select lives_ok($$insert into public.shops (created_by, slug, name) values ('a0000000-0000-0000-0000-000000000006', 'boutique-awa', 'Boutique Awa')$$, 'un client cree une boutique');
select is((select count(*) from public.shop_members where role = 'owner' and user_id = 'a0000000-0000-0000-0000-000000000006'), 1::bigint, 'le createur devient proprietaire');
select is((select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.shop_id = (select id from public.shops where slug = 'boutique-awa')), 'free', 'plan gratuit attribue');
select throws_ok($$insert into public.shops (created_by, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'usurpation', 'Usurpation')$$, '42501', null, 'on ne peut pas creer une boutique au nom d''un autre');
select throws_ok($$update public.shops set review_status = 'approved' where slug = 'boutique-awa'$$, '42501', null, 'le proprietaire ne peut pas s''auto-approuver');
select throws_ok($$update public.shops set rating_avg = 5 where slug = 'boutique-awa'$$, '42501', null, 'la note ne se modifie pas a la main');
select lives_ok($$insert into public.products (shop_id, name, price) select (select id from public.shops where slug = 'boutique-awa'), 'P' || g, 1000 from generate_series(1, 15) g$$, '15 produits autorises en plan gratuit');
select throws_like($$insert into public.products (shop_id, name, price) values ((select id from public.shops where slug = 'boutique-awa'), 'P16', 1000)$$, 'plan_limit_products%', 'le 16e produit est refuse en plan gratuit');
select throws_ok($$insert into public.products (shop_id, name, price) values ('50000000-0000-0000-0000-000000000002', 'Intrus', 100)$$, '42501', null, 'impossible d''ajouter un produit dans la boutique d''un autre');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_ok($$insert into public.products (shop_id, name, price) values ('50000000-0000-0000-0000-000000000001', 'Negatif', -5)$$, '23514', null, 'prix negatif refuse');

-- =====================================================================
-- D. Commandes : creation, USSD, machine a etats
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok($$insert into public.carts (shop_id, customer_id) values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006')$$, 'c1 cree son panier');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000001', 2 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'$$, 'c1 ajoute 2 marteaux');
select throws_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000004', 1 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'$$, '23503', null, 'un produit d''une autre boutique ne peut pas entrer dans le panier');
select lives_ok($$insert into ctx select 'o1', public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_orange')::text$$, 'commande creee depuis le panier');
select is((select total from public.orders where id = tests.v('o1')::uuid), 10000, 'total calcule cote serveur');
select is((select status::text from public.orders where id = tests.v('o1')::uuid), 'pending_payment', 'statut initial');
select ok((select expires_at is not null from public.orders where id = tests.v('o1')::uuid), 'un delai d''expiration USSD est fixe');
select is((select name_snapshot from public.order_items where order_id = tests.v('o1')::uuid), 'Marteau', 'nom du produit fige dans la commande');
select throws_ok(format($$update public.orders set status = 'paid' where id = %L$$, tests.v('o1')), '42501', null, 'UPDATE direct des commandes interdit');
select throws_like(format($$select public.transition_order(%L, 'paid')$$, tests.v('o1')), 'transition_not_allowed%', 'un client ne peut pas se declarer paye');
select tests.as_postgres();
select is((select stock from public.products where id = 'b0000000-0000-0000-0000-000000000001'), 8, 'stock decremente a la commande');

select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_ok(format($$select public.declare_payment(%L, '+22670000007', 'AB12CD34')$$, tests.v('o1')), '42501', null, 'on ne declare pas le paiement de la commande d''un autre');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(format($$select public.declare_payment(%L, '+22670000006', 'x')$$, tests.v('o1')), '23514', null, 'reference de transaction trop courte refusee');
select lives_ok(format($$select public.declare_payment(%L, '+22670000006', 'ab12cd34')$$, tests.v('o1')), 'c1 declare son paiement USSD');
select is((select status::text from public.orders where id = tests.v('o1')::uuid), 'payment_declared', 'statut payment_declared');
select is((select transaction_ref from public.payment_declarations where order_id = tests.v('o1')::uuid), 'AB12CD34', 'reference normalisee en majuscules');
select ok((select expires_at is null from public.orders where id = tests.v('o1')::uuid), 'payment_declared n''expire jamais seule');

-- Seconde commande (c2) : meme reference refusee, rejet, limite de rejets, annulation, remise en stock
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok($$insert into public.carts (shop_id, customer_id) values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007')$$, 'c2 cree son panier');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000001', 3 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000007'$$, 'c2 ajoute 3 marteaux');
select lives_ok($$insert into ctx select 'o2', public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000007'), 'ussd_orange')::text$$, 'commande de c2');
select throws_like(format($$select public.declare_payment(%L, '+22670000007', 'ab12cd34')$$, tests.v('o2')), 'reference_already_used%', 'une reference deja utilisee est refusee');
select lives_ok(format($$select public.declare_payment(%L, '+22670000007', 'zz99xx11')$$, tests.v('o2')), 'c2 declare avec une autre reference');

select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_ok(format($$select public.transition_order(%L, 'paid')$$, tests.v('o1')), '42501', null, 'm2 (autre boutique) ne peut pas toucher aux commandes de la boutique 1');
select is((select count(*) from public.orders where shop_id = '50000000-0000-0000-0000-000000000001'), 0::bigint, 'm2 ne voit aucune commande de la boutique 1');

select tests.as_user('a0000000-0000-0000-0000-000000000002');
select ok((select count(*) from public.orders where shop_id = '50000000-0000-0000-0000-000000000001') >= 2, 'm1 voit les commandes de sa boutique');
select throws_like(format($$select public.transition_order(%L, 'pending_payment')$$, tests.v('o2')), 'reason_required%', 'un rejet exige un motif');
select lives_ok(format($$select public.transition_order(%L, 'pending_payment', 'Montant recu inferieur')$$, tests.v('o2')), 'm1 rejette la premiere declaration');
select is((select reject_count from public.orders where id = tests.v('o2')::uuid), 1, 'compteur de rejets incremente');
select ok((select expires_at is not null from public.orders where id = tests.v('o2')::uuid), 'nouveau delai apres rejet');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(format($$select public.declare_payment(%L, '+22670000007', 'zz99xx12')$$, tests.v('o2')), 'c2 corrige sa reference');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_like(format($$select public.transition_order(%L, 'pending_payment', 'Encore faux')$$, tests.v('o2')), 'reject_limit_reached%', 'un seul rejet autorise');
select throws_like(format($$select public.transition_order(%L, 'cancelled')$$, tests.v('o2')), 'reason_required%', 'annulation sans motif refusee');
select lives_ok(format($$select public.transition_order(%L, 'cancelled', 'Paiement non recu')$$, tests.v('o2')), 'm1 annule avec motif');
select tests.as_postgres();
select is((select stock from public.products where id = 'b0000000-0000-0000-0000-000000000001'), 8, 'stock remis a l''annulation');
select is((select count(*) from public.payment_declarations where order_id = tests.v('o2')::uuid and status = 'rejected'), 2::bigint, 'les deux declarations sont marquees rejetees');

-- Chaine complete de la commande o1 : paid -> confirmed -> ready -> completed
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.transition_order(%L, 'paid', null, 'ref-sms-1')$$, tests.v('o1')), 'm1 confirme le paiement');
select is((select status::text from public.payment_declarations where order_id = tests.v('o1')::uuid), 'confirmed', 'declaration confirmee');
select tests.as_user('a0000000-0000-0000-0000-000000000005');
select throws_ok(format($$select public.transition_order(%L, 'confirmed')$$, tests.v('o1')), '42501', null, 'employe sans droit commandes refuse');
select tests.as_user('a0000000-0000-0000-0000-000000000004');
select lives_ok(format($$select public.transition_order(%L, 'confirmed')$$, tests.v('o1')), 'employe avec droit commandes accepte');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.transition_order(%L, 'ready')$$, tests.v('o1')), 'commande prete');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(format($$select public.transition_order(%L, 'cancelled')$$, tests.v('o1')), 'transition_not_allowed%', 'le client ne peut plus annuler une commande prete');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.transition_order(%L, 'completed')$$, tests.v('o1')), 'commande terminee');
select throws_like(format($$select public.transition_order(%L, 'refunded', null, 'x')$$, tests.v('o1')), 'transition_not_allowed%', 'un statut final est definitif');
select tests.as_postgres();
select is((select count(*) from public.order_status_history where order_id = tests.v('o1')::uuid), 6::bigint, 'historique complet (6 lignes)');
select ok((select count(*) from public.audit_log where entity_id = tests.v('o1')::uuid and action = 'order.paid') = 1, 'paiement manuel journalise dans audit_log');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select is((select count(*) from public.notifications), 4::bigint, 'c1 recoit 4 notifications de statut');
select lives_ok($$update public.notifications set read_at = now()$$, 'c1 marque ses notifications comme lues');
select throws_ok($$update public.notifications set type = 'x'$$, '42501', null, 'seul read_at est modifiable');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select is((select count(*) from public.notifications where user_id = 'a0000000-0000-0000-0000-000000000006'), 0::bigint, 'c2 ne voit pas les notifications de c1');

-- Limites a la commande : stock, plafond USSD
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000001', 9 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'$$, 'c1 ajoute 9 marteaux (stock 8)');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_orange')$$, 'insufficient_stock%', 'stock insuffisant refuse');
select lives_ok($$delete from public.cart_items$$, 'c1 vide son panier');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000002', 11 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'$$, 'c1 ajoute 11 peintures (165 000 FCFA)');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_orange')$$, 'amount_exceeds_manual_limit%', 'plafond du paiement USSD respecte');
select lives_ok($$update public.cart_items set quantity = 1$$, 'c1 ramene la quantite a 1');

-- Promotions
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_like($$insert into public.coupons (shop_id, code, type, value) values ('50000000-0000-0000-0000-000000000002', 'NOEL', 'percent', 10)$$, 'plan_feature_promotions%', 'les promotions exigent le plan Pro');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok($$insert into public.coupons (shop_id, code, type, value) values ('50000000-0000-0000-0000-000000000001', 'PROMO10', 'percent', 10)$$, 'm1 cree un code promo');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok($$insert into ctx select 'o3', public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'cash_on_delivery', 'pickup', null, null, 'promo10')::text$$, 'commande avec code promo');
select is((select discount from public.orders where id = tests.v('o3')::uuid), 1500, 'remise de 10 % calculee cote serveur');
select is((select total from public.orders where id = tests.v('o3')::uuid), 13500, 'total apres remise');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000002', 1 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'$$, 'c1 remplit a nouveau son panier');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'cash_on_delivery', 'pickup', null, null, 'PROMO10')$$, 'coupon_already_used%', 'un code promo n''est utilisable qu''une fois par client');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_moov')$$, 'payment_method_not_available%', 'mode de paiement non propose par la boutique refuse');

-- Expiration automatique
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok($$insert into public.carts (shop_id, customer_id) values ('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007')$$, 'c2 cree un panier boutique 2');
select lives_ok($$insert into public.cart_items (shop_id, cart_id, product_id, quantity) select shop_id, id, 'b0000000-0000-0000-0000-000000000004', 1 from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000007' and shop_id = '50000000-0000-0000-0000-000000000002'$$, 'c2 ajoute un article');
select lives_ok($$insert into ctx select 'o4', public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000007' and shop_id = '50000000-0000-0000-0000-000000000002'), 'ussd_moov')::text$$, 'commande a expirer');
select tests.as_postgres();
select lives_ok(format($$update public.orders set expires_at = now() - interval '1 minute' where id = %L$$, tests.v('o4')), 'delai depasse (simulation)');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok('select public.expire_pending_orders()', '42501', null, 'seul service_role peut lancer l''expiration');
select tests.as_service();
select is(public.expire_pending_orders(), 1, 'une commande expiree annulee');
select tests.as_postgres();
select is((select cancelled_reason from public.orders where id = tests.v('o4')::uuid), 'expired', 'motif expired');

-- =====================================================================
-- E. Rendez-vous : creneaux et anti double-reservation
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(format($$insert into ctx select 'b1', public.book_slot(%L, %L, %L::timestamptz)::text$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'c1 reserve lundi 09:00');
select is((select status::text from public.bookings where id = tests.v('b1')::uuid), 'pending', 'reservation en attente de confirmation');
select throws_ok(format($$insert into public.bookings (shop_id, service_id, resource_id, customer_id, during) values (%L, %L, %L, %L, tstzrange(%L::timestamptz, %L::timestamptz + interval '1 hour'))$$, '50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), 'a0000000-0000-0000-0000-000000000006', tests.v('mon9'), tests.v('mon9')), '42501', null, 'INSERT direct dans bookings interdit');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_like(format($$select public.book_slot(%L, %L, %L::timestamptz)$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'slot_taken%', 'meme creneau refuse');
select throws_like(format($$select public.book_slot(%L, %L, %L::timestamptz + interval '30 minutes')$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'slot_taken%', 'creneau qui chevauche refuse');
select lives_ok(format($$insert into ctx select 'b2', public.book_slot(%L, %L, %L::timestamptz + interval '1 hour')::text$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'creneau adjacent accepte');
select throws_like(format($$select public.book_slot(%L, %L, %L::timestamptz + interval '11 hours')$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'outside_opening_hours%', 'hors horaires refuse');
select throws_like(format($$select public.book_slot(%L, %L, now() + interval '30 minutes')$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1')), 'too_soon%', 'delai minimal respecte');
select throws_like(format($$select public.book_slot(%L, %L, now() + interval '100 days')$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1')), 'too_far%', 'reservation trop lointaine refusee');
select throws_like(format($$select public.book_slot(%L, %L, %L::timestamptz)$$, 'c0000000-0000-0000-0000-000000000002', tests.v('r2'), tests.v('mon9')), 'plan_feature_bookings%', 'les rendez-vous exigent le plan Pro');
select tests.as_postgres();
select throws_ok(format($$insert into public.bookings (shop_id, service_id, resource_id, customer_id, during, status) values (%L, %L, %L, %L, tstzrange(%L::timestamptz + interval '10 minutes', %L::timestamptz + interval '50 minutes'), 'confirmed')$$, '50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), 'a0000000-0000-0000-0000-000000000007', tests.v('mon9'), tests.v('mon9')), '23P01', null, 'la base elle-meme refuse un chevauchement (contrainte d''exclusion)');
select lives_ok(format($$insert into public.bookings (shop_id, service_id, resource_id, customer_id, during, status) values (%L, %L, %L, %L, tstzrange(%L::timestamptz, %L::timestamptz + interval '1 hour'), 'cancelled')$$, '50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), 'a0000000-0000-0000-0000-000000000007', tests.v('mon9'), tests.v('mon9')), 'une reservation annulee ne bloque pas le creneau');

select tests.as_user('a0000000-0000-0000-0000-000000000003');
select is((select count(*) from public.bookings where shop_id = '50000000-0000-0000-0000-000000000001'), 0::bigint, 'm2 ne voit pas les reservations de la boutique 1');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_like(format($$select public.set_booking_status(%L, 'cancelled')$$, tests.v('b1')), 'reason_required%', 'annulation par le commercant : motif obligatoire');
select lives_ok(format($$select public.set_booking_status(%L, 'confirmed')$$, tests.v('b1')), 'm1 confirme la reservation');
select throws_like(format($$select public.set_booking_status(%L, 'completed')$$, tests.v('b1')), 'booking_not_started%', 'impossible de terminer une reservation future');
select lives_ok(format($$select public.set_booking_status(%L, 'cancelled', 'Client injoignable')$$, tests.v('b1')), 'm1 annule avec motif');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(format($$insert into ctx select 'b3', public.book_slot(%L, %L, %L::timestamptz)::text$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'le creneau annule est de nouveau reservable');
select tests.as_postgres();
update public.shop_settings set booking_cancel_before_hours = 720 where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_like(format($$select public.set_booking_status(%L, 'cancelled')$$, tests.v('b3')), 'cancellation_too_late%', 'annulation client trop tardive refusee');
select tests.as_postgres();
update public.shop_settings set booking_cancel_before_hours = 24 where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(format($$select public.set_booking_status(%L, 'cancelled')$$, tests.v('b3')), 'annulation client dans les delais');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(format($$select public.set_booking_status(%L, 'cancelled')$$, tests.v('b3')), 'forbidden%', 'on n''annule pas la reservation d''un autre');

-- =====================================================================
-- F. Avis verifies
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 5)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o3')), 'review_not_allowed%', 'avis refuse tant que la commande n''est pas terminee');
select lives_ok(format($$insert into public.reviews (shop_id, customer_id, order_id, rating, comment) values (%L, %L, %L, 5, 'Tres bien')$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o1')), 'avis sur commande terminee');
select is((select author_name from public.reviews where order_id = tests.v('o1')::uuid), 'Awa O.', 'nom d''auteur abrege');
select throws_ok(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 4)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o1')), '23505', null, 'un seul avis par commande');
select throws_ok(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 6)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o1')), '23514', null, 'note hors 1-5 refusee');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_ok(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 1)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o1')), '42501', null, 'on ne poste pas un avis au nom d''un autre');
select throws_like(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 1)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', tests.v('o1')), 'review_not_allowed%', 'on n''evalue pas la commande d''un autre');
select tests.as_postgres();
select is((select rating_avg from public.shops where id = '50000000-0000-0000-0000-000000000001'), 5.00::numeric, 'note moyenne mise a jour');
select is((select rating_count from public.shops where id = '50000000-0000-0000-0000-000000000001'), 1, 'nombre d''avis mis a jour');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(format($$select public.reply_to_review(%L, 'Merci')$$, (select id::text from public.reviews limit 1)), '42501', null, 'le client ne peut pas repondre a son propre avis en tant que boutique');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.reply_to_review(%L, 'Merci Awa !')$$, (select id::text from public.reviews limit 1)), 'le commercant repond a l''avis');
select tests.as_anon();
select is((select shop_reply from public.reviews limit 1), 'Merci Awa !', 'la reponse est publique');
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select lives_ok(format($$select public.moderate_review(%L, 'hidden')$$, (select id::text from public.reviews limit 1)), 'l''admin masque un avis');
select tests.as_anon();
select is((select count(*) from public.reviews), 0::bigint, 'un avis masque disparait de la vue publique');
select tests.as_postgres();
select is((select rating_count from public.shops where id = '50000000-0000-0000-0000-000000000001'), 0, 'la note se recalcule apres moderation');

-- =====================================================================
-- G. Validation des boutiques (24 h)
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_ok($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, '42501', null, 'seul le proprietaire soumet sa boutique');
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_like($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'missing_whatsapp%', 'soumission : WhatsApp requis');
select tests.as_postgres();
update public.shops set whatsapp = '+22670333333' where id = '50000000-0000-0000-0000-000000000003';
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_like($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'missing_catalog%', 'soumission : au moins un produit ou service reel');
select lives_ok($$insert into public.products (shop_id, name, price) values ('50000000-0000-0000-0000-000000000003', 'Article', 2000)$$, 'm2 ajoute un produit');
select throws_like($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'missing_payment_method%', 'soumission : un mode d''encaissement requis');
select lives_ok($$insert into public.shop_payment_methods (shop_id, type, phone_or_code) values ('50000000-0000-0000-0000-000000000003', 'ussd_orange', '+22670333333')$$, 'm2 configure l''encaissement');
select lives_ok($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'soumission acceptee');
select throws_ok($$select public.review_shop('50000000-0000-0000-0000-000000000003', true)$$, '42501', null, 'un commercant ne s''approuve pas lui-meme');
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select throws_like($$select public.review_shop('50000000-0000-0000-0000-000000000003', false)$$, 'reason_required%', 'un refus exige un motif');
select lives_ok($$select public.review_shop('50000000-0000-0000-0000-000000000003', true)$$, 'l''admin approuve');
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_like($$update public.shops set slug = 'nouveau-nom' where id = '50000000-0000-0000-0000-000000000003'$$, 'slug_locked%', 'l''adresse d''une boutique approuvee est verrouillee');
select tests.as_anon();
select is((select count(*) from public.shops), 3::bigint, 'la boutique approuvee devient publique');
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_shop_suspended('50000000-0000-0000-0000-000000000003', true, 'test')$$, 'l''admin suspend la boutique');
select tests.as_anon();
select is((select count(*) from public.shops), 2::bigint, 'une boutique suspendue disparait du public');
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select ok((select count(*) from public.audit_log) > 0, 'l''admin lit le journal d''audit');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is((select count(*) from public.audit_log), 0::bigint, 'un commercant ne lit pas le journal d''audit');

-- =====================================================================
-- H. Storage
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('payment-proofs', %L, 'a0000000-0000-0000-0000-000000000006')$$, '50000000-0000-0000-0000-000000000001/' || tests.v('o1') || '/proof.png'), 'c1 envoie une capture dans le dossier de sa commande');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('payment-proofs', %L, 'a0000000-0000-0000-0000-000000000007')$$, '50000000-0000-0000-0000-000000000001/' || tests.v('o1') || '/faux.png'), '42501', null, 'c2 ne peut pas deposer dans la commande de c1');
select is((select count(*) from storage.objects where bucket_id = 'payment-proofs'), 0::bigint, 'c2 ne voit pas la capture de c1');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is((select count(*) from storage.objects where bucket_id = 'payment-proofs'), 1::bigint, 'le commercant voit la capture');
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('shop-assets', '50000000-0000-0000-0000-000000000001/logo.png', 'a0000000-0000-0000-0000-000000000002')$$, 'm1 envoie un logo');
select tests.as_user('a0000000-0000-0000-0000-000000000005');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('shop-assets', '50000000-0000-0000-0000-000000000001/x.png', 'a0000000-0000-0000-0000-000000000005')$$, '42501', null, 'employe sans droit catalogue refuse');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('shop-assets', '50000000-0000-0000-0000-000000000001/y.png', 'a0000000-0000-0000-0000-000000000006')$$, '42501', null, 'un client ne depose pas dans les images d''une boutique');

-- =====================================================================
-- I. Integrite des donnees
-- =====================================================================
select tests.as_postgres();
select throws_ok($$insert into public.product_images (shop_id, product_id, path) values ('50000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'x.webp')$$, '23503', null, 'une image ne peut pas lier un produit d''une autre boutique');
select throws_ok($$insert into public.payments (shop_id, provider, idempotency_key, amount) values ('50000000-0000-0000-0000-000000000001', 'x', 'k1', 100)$$, '23514', null, 'un paiement doit viser une commande OU une reservation');
select throws_ok($$insert into public.webhook_events (provider, event_id, payload) values ('p', 'e1', '{}'), ('p', 'e1', '{}')$$, '23505', null, 'un evenement webhook n''est traite qu''une fois');
select throws_ok($$insert into public.shops (created_by, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'admin', 'Reserve')$$, '23514', null, 'slugs reserves refuses');

-- =====================================================================
-- J. Webhook agregateur (service_role) : seul le systeme valide un paiement en ligne
-- =====================================================================
select tests.as_service();
select lives_ok($$with x as (insert into public.orders (shop_id, customer_id, payment_method, subtotal, total) values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'aggregator', 1000, 1000) returning id) insert into ctx select 'o5', id::text from x$$, 'service_role insere une commande (reference generee par defaut)');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_like(format($$select public.transition_order(%L, 'paid')$$, tests.v('o5')), 'aggregator_payment_requires_webhook%', 'un commercant ne peut pas valider a la main un paiement agregateur');
select tests.as_service();
select lives_ok(format($$select public.transition_order(%L, 'paid', 'webhook verifie', 'PROVIDER-REF-1')$$, tests.v('o5')), 'le systeme (webhook verifie) valide le paiement');
select tests.as_postgres();
select is((select status::text from public.orders where id = tests.v('o5')::uuid), 'paid', 'commande agregateur payee par le systeme');
select is((select actor_type::text from public.order_status_history where order_id = tests.v('o5')::uuid and to_status = 'paid'), 'system', 'historique : acteur system');

select * from finish();
rollback;
