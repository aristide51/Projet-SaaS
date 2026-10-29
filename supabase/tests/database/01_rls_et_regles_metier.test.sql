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
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ),
  'les commandes sont publiées pour le suivi Realtime du client'
);

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
update auth.users
set email_confirmed_at = now()
where id in (
  'a0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000007'
);
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
select is(
  (select slug from public.shops where id = '50000000-0000-0000-0000-000000000001'),
  'quincaillerie-test',
  'anon : les colonnes publiques de la boutique restent lisibles'
);
select throws_ok(
  $$select created_by from public.shops where id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon : l’identifiant du propriétaire est masqué'
);
select throws_ok(
  $$select reviewed_by from public.shops where id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon : l’identifiant du modérateur est masqué'
);
select throws_ok(
  $$select rejection_reason from public.shops where id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon : le motif de modération est masqué'
);
select throws_ok(
  $$select review_status from public.shops where id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon : le statut interne de publication est masqué'
);
select throws_ok(
  $$select is_suspended from public.shops where id = '50000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'anon : le statut interne de suspension est masqué'
);
select throws_ok(
  $$select * from public.preview_order(
    '00000000-0000-0000-0000-000000000000',
    'cash_on_delivery', 'pickup', null
  )$$,
  '42501', null, 'anon ne peut pas appeler l’aperçu de commande'
);
select is((select count(*) from public.products where shop_id = '50000000-0000-0000-0000-000000000001'), 2::bigint, 'anon : les produits masques sont invisibles');
select is((select count(*) from public.search_public_storefront_products(
  '50000000-0000-0000-0000-000000000001', 'Marteu', null
)), 1::bigint, 'la recherche publique tolere une faute avec l''index trigram');
select is((select count(*) from public.search_public_storefront_products(
  '50000000-0000-0000-0000-000000000001', 'Cache', null
)), 0::bigint, 'la recherche publique ne retourne pas les produits masques');
select is((select count(*) from public.search_public_storefront_products(
  '50000000-0000-0000-0000-000000000001', 'Coupe', null
)), 1::bigint, 'la recherche publique trouve aussi les services');
select ok(not (
  (select to_jsonb(p) ?| array['stock', 'sku', 'compatibility', 'is_sample', 'deleted_at']
   from public.search_public_storefront_products(
     '50000000-0000-0000-0000-000000000001', 'Marteau', null
   ) p limit 1)
), 'la recherche publique ne renvoie aucune colonne interne du catalogue');
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
select lives_ok($$update public.profiles set full_name = 'Awa Test', avatar_url = 'https://example.test/avatar.webp' where id = 'a0000000-0000-0000-0000-000000000006'$$, 'un client modifie son nom et son avatar');
select throws_ok($$update public.profiles set phone = '+33123456789' where id = 'a0000000-0000-0000-0000-000000000006'$$, '23514', null, 'un numero hors format burkinabe est refuse');
select lives_ok($$update public.profiles set full_name = 'Awa Ouedraogo', avatar_url = null where id = 'a0000000-0000-0000-0000-000000000006'$$, 'les donnees de profil de test sont restaurees');
select lives_ok($$insert into public.account_deletion_requests (user_id) values ('a0000000-0000-0000-0000-000000000006')$$, 'un client enregistre sa demande de suppression');
select is((select count(*) from public.account_deletion_requests), 1::bigint, 'le client voit sa demande de suppression');
select throws_ok($$insert into public.account_deletion_requests (user_id) values ('a0000000-0000-0000-0000-000000000007')$$, '42501', null, 'un client ne peut pas enregistrer une demande pour un autre compte');
select throws_ok($$update public.account_deletion_requests set status = 'completed' where user_id = 'a0000000-0000-0000-0000-000000000006'$$, '42501', null, 'un client ne peut pas traiter sa demande');
select throws_ok($$delete from public.account_deletion_requests where user_id = 'a0000000-0000-0000-0000-000000000006'$$, '42501', null, 'un client ne peut pas effacer sa demande');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select is((select count(*) from public.account_deletion_requests), 0::bigint, 'un autre client ne voit pas la demande');

-- =====================================================================
-- C. Creation de boutique et limites du plan gratuit
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok($$insert into public.shops (created_by, slug, name) values ('a0000000-0000-0000-0000-000000000006', 'boutique-awa', 'Boutique Awa')$$, 'un client cree une boutique');
select is((select count(*) from public.shop_members where role = 'owner' and user_id = 'a0000000-0000-0000-0000-000000000006'), 1::bigint, 'le createur devient proprietaire');
select is((select p.code from public.subscriptions s join public.plans p on p.id = s.plan_id where s.shop_id = (select id from public.shops where slug = 'boutique-awa')), 'free', 'plan gratuit attribue');
select throws_ok($$insert into public.shops (created_by, slug, name) values ('a0000000-0000-0000-0000-000000000002', 'usurpation', 'Usurpation')$$, '42501', null, 'on ne peut pas creer une boutique au nom d''un autre');
select throws_ok($$update public.shops set review_status = 'approved' where slug = 'boutique-awa'$$, '42501', null, 'le proprietaire ne peut pas s''auto-approuver');
select throws_ok($$update public.shops set rating_avg = 5 where slug = 'boutique-awa'$$, '42501', null, 'la note ne se modifie pas a la main');
select lives_ok($sql$
  do $block$
  declare v_shop uuid;
  begin
    select id into v_shop from public.shops where slug = 'boutique-awa';
    for i in 1..15 loop
      if i = 1 then
        insert into ctx (k, v) values ('free_product', public.save_catalog_product(v_shop, jsonb_build_object(
          'name', 'P' || i, 'price', 1000, 'status', 'available',
          'variants', '[]'::jsonb
        ))::text);
      else
        perform public.save_catalog_product(v_shop, jsonb_build_object(
        'name', 'P' || i, 'price', 1000, 'status', 'available',
        'variants', '[]'::jsonb
        ));
      end if;
    end loop;
  end $block$
$sql$, '15 produits autorises en plan gratuit');
select is(
  public.catalog_product_limit(
    (select id from public.shops where slug = 'boutique-awa')
  ),
  15,
  'le tableau de bord peut afficher la limite exacte lorsque les quinze places sont utilisees'
);
select throws_like($$select public.save_catalog_product((select id from public.shops where slug = 'boutique-awa'), jsonb_build_object('name', 'P16', 'price', 1000, 'status', 'available', 'variants', '[]'::jsonb))$$, 'plan_limit_products%', 'le 16e produit est refuse en plan gratuit');
select lives_ok($$select public.set_catalog_item_deleted((select id from public.shops where slug = 'boutique-awa'), 'product', tests.v('free_product')::uuid, true)$$, 'le proprietaire place un produit dans la corbeille');
select lives_ok($$select public.save_catalog_product((select id from public.shops where slug = 'boutique-awa'), jsonb_build_object('name', 'P16', 'price', 1000, 'status', 'available', 'variants', '[]'::jsonb))$$, 'la suppression libere une place dans le plan');
select throws_like($$select public.set_catalog_item_deleted((select id from public.shops where slug = 'boutique-awa'), 'product', tests.v('free_product')::uuid, false)$$, 'plan_limit_products%', 'la restauration respecte la limite du plan');
select lives_ok($$select public.seed_catalog_samples(
  (select id from public.shops where slug = 'boutique-awa'),
  '{"products":[{"name":"Exemple gratuit","price":1000,"category_name":"Exemples"}],"services":[]}'::jsonb
)$$, 'les exemples ne comptent pas dans la limite du plan gratuit');
insert into ctx select 'free_sample', id::text from public.products where shop_id = (select id from public.shops where slug = 'boutique-awa') and name = 'Exemple gratuit';
select throws_like(format(
  $$select public.save_catalog_product((select id from public.shops where slug = 'boutique-awa'), jsonb_build_object(
    'id', %L, 'name', 'Exemple modifie', 'price', 1000, 'status', 'available', 'variants', '[]'::jsonb
  ))$$,
  tests.v('free_sample')
), 'plan_limit_products%', 'modifier un exemple est bloque si le plan gratuit est plein');
select throws_ok($$select public.save_catalog_product('50000000-0000-0000-0000-000000000002', jsonb_build_object('name', 'Intrus', 'price', 100, 'status', 'available', 'variants', '[]'::jsonb))$$, '42501', null, 'impossible d''ajouter un produit dans la boutique d''un autre');
select tests.as_user('a0000000-0000-0000-0000-000000000004');
select throws_ok($$select public.save_catalog_product('50000000-0000-0000-0000-000000000001', jsonb_build_object('name', 'Refus', 'price', 100, 'status', 'available', 'variants', '[]'::jsonb))$$, '42501', null, 'un employe sans droit catalogue ne peut pas ajouter de produit');
select throws_ok($$select public.seed_catalog_samples('50000000-0000-0000-0000-000000000001', '{"products":[],"services":[{"name":"Interdit"}]}'::jsonb)$$, '42501', null, 'un employe sans droit catalogue ne peut pas charger les exemples');
select throws_ok($$insert into public.service_images (shop_id, service_id, path) values ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001/services/c0000000-0000-0000-0000-000000000001/refus.webp')$$, '42501', null, 'un employe sans droit catalogue ne peut pas ajouter une photo de service');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok($$insert into public.categories (id, shop_id, name) values ('d0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Outils')$$, 'le proprietaire ajoute une categorie racine');
select lives_ok($$insert into public.categories (id, shop_id, parent_id, name) values ('d0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Marteaux')$$, 'le proprietaire ajoute une sous-categorie');
select throws_like($$update public.categories set parent_id = 'd0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001'$$, 'category_cycle%', 'les cycles de categories sont refuses');
select lives_ok($$insert into public.service_images (shop_id, service_id, path) values ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001/services/c0000000-0000-0000-0000-000000000001/photo.webp')$$, 'le proprietaire ajoute une photo de service');
select throws_ok($$insert into public.products (shop_id, name, price) values ('50000000-0000-0000-0000-000000000001', 'Direct', 500)$$, '42501', null, 'les ecritures produit directes sont interdites');
select throws_ok($$select public.save_catalog_product('50000000-0000-0000-0000-000000000001', jsonb_build_object('name', 'Negatif', 'price', -5, 'status', 'available', 'variants', '[]'::jsonb))$$, '23514', null, 'prix negatif refuse par contrainte SQL');
select lives_ok($$select public.save_catalog_product('50000000-0000-0000-0000-000000000001', jsonb_build_object('name', 'Produit autorise', 'price', 1000, 'status', 'available', 'variants', '[]'::jsonb))$$, 'un proprietaire peut creer un produit via RPC');
select lives_ok($$select public.seed_catalog_samples('50000000-0000-0000-0000-000000000001', jsonb_build_object(
  'products', jsonb_build_array(jsonb_build_object(
    'name', 'Produit exemple test', 'description', 'Exemple non publie', 'price', 1000,
    'compare_at_price', null, 'sku', null, 'compatibility', null, 'stock', null,
    'status', 'available', 'category_name', 'Exemples', 'variant_name', null,
    'variant_price', null, 'variant_stock', null
  )),
  'services', jsonb_build_array(jsonb_build_object(
    'name', 'Service exemple test', 'description', 'Exemple non publie',
    'duration_min', 60, 'price', 2000, 'deposit_amount', 0
  ))
))$$, 'le proprietaire ajoute les exemples en is_sample');
insert into ctx select 'sample_product', id::text from public.products where shop_id = '50000000-0000-0000-0000-000000000001' and name = 'Produit exemple test';
insert into ctx select 'sample_service', id::text from public.services where shop_id = '50000000-0000-0000-0000-000000000001' and name = 'Service exemple test';
insert into ctx select 'sample_category', id::text from public.categories where shop_id = '50000000-0000-0000-0000-000000000001' and name = 'Exemples';
select lives_ok(format(
  $$insert into public.service_images (shop_id, service_id, path) values ('50000000-0000-0000-0000-000000000001', %L, '50000000-0000-0000-0000-000000000001/services/%s/exemple.webp')$$,
  tests.v('sample_service'), tests.v('sample_service')
), 'une photo est associee au service exemple');
select tests.as_anon();
select is((select count(*) from public.products where id = tests.v('sample_product')::uuid), 0::bigint, 'un produit exemple non modifie est invisible au public');
select is((select count(*) from public.services where id = tests.v('sample_service')::uuid), 0::bigint, 'un service exemple non modifie est invisible au public');
select is((select count(*) from public.service_images where service_id = tests.v('sample_service')::uuid), 0::bigint, 'la photo du service exemple non modifie est invisible au public');
select is((select count(*) from public.categories where shop_id = '50000000-0000-0000-0000-000000000001' and name = 'Exemples'), 0::bigint, 'la categorie d''un exemple non modifie est invisible au public');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format(
  $$select public.save_catalog_product('50000000-0000-0000-0000-000000000001', jsonb_build_object(
    'id', %L, 'name', 'Produit exemple modifie', 'price', 1000,
    'category_id', %L, 'status', 'available', 'variants', '[]'::jsonb
  ))$$,
  tests.v('sample_product'), tests.v('sample_category')
), 'modifier un produit exemple le rend publiable');
select lives_ok(format(
  $$select public.save_catalog_service('50000000-0000-0000-0000-000000000001', jsonb_build_object(
    'id', %L, 'name', 'Service exemple modifie', 'duration_min', 60,
    'price', 2000, 'deposit_amount', 0, 'active', true
  ))$$,
  tests.v('sample_service')
), 'modifier un service exemple le rend publiable');
select is((select is_sample from public.products where id = tests.v('sample_product')::uuid), false, 'un produit modifie quitte le statut exemple');
select is((select is_sample from public.services where id = tests.v('sample_service')::uuid), false, 'un service modifie quitte le statut exemple');
select tests.as_anon();
select is((select count(*) from public.products where id = tests.v('sample_product')::uuid), 1::bigint, 'le produit modifie devient visible au public');
select is((select count(*) from public.services where id = tests.v('sample_service')::uuid), 1::bigint, 'le service modifie devient visible au public');
select is((select count(*) from public.categories where shop_id = '50000000-0000-0000-0000-000000000001' and name = 'Exemples'), 1::bigint, 'la categorie est visible des qu''un produit modifie y est publie');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is((
  select sum(public.import_catalog_product_batch(
    '50000000-0000-0000-0000-000000000001',
    batch.products
  ))
  from (
    select jsonb_agg(jsonb_build_object(
      'name', 'CSV 500 ' || n, 'description', '', 'price', 1000,
      'compare_at_price', null, 'sku', '', 'compatibility', '', 'stock', null,
      'status', 'available', 'category_name', '', 'variant_name', '',
      'variant_price', null, 'variant_stock', null
    )) as products
    from generate_series(1, 500) as rows(n)
    group by (n - 1) / 50
  ) as batch
), 500::bigint, '500 produits CSV sont importes en lots de 50');
select is((select count(*) from public.products where shop_id = '50000000-0000-0000-0000-000000000001' and name like 'CSV 500 %'), 500::bigint, 'les 500 produits importes sont persistants');
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_ok($$update public.services set price = 1 where id = 'c0000000-0000-0000-0000-000000000002'$$, '42501', null, 'la modification directe du prix service est interdite');
select lives_ok($$select public.save_catalog_service('50000000-0000-0000-0000-000000000002', jsonb_build_object('name', 'Révision', 'duration_min', 60, 'price', 1000, 'deposit_amount', 0, 'active', true))$$, 'un proprietaire peut creer un service via RPC');
select tests.as_user('a0000000-0000-0000-0000-000000000002');

-- =====================================================================
-- D. Commandes : creation, USSD, machine a etats
-- =====================================================================
-- Panier invité : jeton opaque, isolation et fusion dans le compte.
select tests.as_anon();
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    null, 2, repeat('a', 64)
  )$$,
  'un visiteur ajoute un article au panier serveur'
);
select is(
  (select quantity from public.get_cart_snapshot(
    '50000000-0000-0000-0000-000000000001', repeat('a', 64)
  )),
  2,
  'le jeton invité permet de relire uniquement son panier'
);
select is(
  (select count(*) from public.get_cart_snapshot(
    '50000000-0000-0000-0000-000000000001', repeat('b', 64)
  )),
  0::bigint,
  'un autre jeton ne voit pas ce panier'
);
select throws_like(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000004',
    null, 1, repeat('a', 64)
  )$$,
  'product_unavailable%',
  'un produit d’une autre boutique est refusé par le panier invité'
);
select throws_like(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    null, 98, repeat('a', 64)
  )$$,
  'cart_quantity_limit%',
  'la quantité cumulée ne peut pas dépasser 99'
);
select throws_like(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    null, 0, repeat('a', 64)
  )$$,
  'invalid_cart_quantity%',
  'une quantité nulle est refusée'
);
select tests.as_postgres();
select is(
  (select token_hash = extensions.digest(convert_to(repeat('a', 64), 'UTF8'), 'sha256')
   from public.guest_carts
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  true,
  'seule l’empreinte du jeton invité est stockée'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(
  $$select public.merge_guest_carts(repeat('a', 64))$$,
  'un client confirmé fusionne son panier invité'
);
select is(
  (select quantity from public.get_cart_snapshot(
    '50000000-0000-0000-0000-000000000001', null
  )),
  2,
  'la fusion conserve les lignes du panier invité'
);
select lives_ok(
  $$select public.remove_cart_item(
    '50000000-0000-0000-0000-000000000001',
    (select item_id from public.get_cart_snapshot(
      '50000000-0000-0000-0000-000000000001', null
    ) limit 1),
    null
  )$$,
  'le propriétaire peut retirer la ligne fusionnée'
);

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$insert into public.carts (shop_id, customer_id)
    values ('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006')$$,
  '42501', null, 'la création directe d’un panier est interdite'
);
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    null, 2, null
  )$$,
  'c1 ajoute 2 marteaux via la RPC'
);
select throws_like(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000004',
    null, 1, null
  )$$,
  'product_unavailable%',
  'un produit d’une autre boutique ne peut pas entrer dans le panier'
);
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
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    null, 3, null
  )$$,
  'c2 ajoute 3 marteaux via la RPC'
);
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
select tests.as_postgres();
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000006'
     and type = 'review_invitation'
     and payload ->> 'order_id' = tests.v('o1')),
  1::bigint,
  'une commande terminee envoie une invitation a evaluer'
);
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_like(format($$select public.transition_order(%L, 'refunded', null, 'x')$$, tests.v('o1')), 'transition_not_allowed%', 'un statut final est definitif');
select tests.as_postgres();
select is((select count(*) from public.order_status_history where order_id = tests.v('o1')::uuid), 6::bigint, 'historique complet (6 lignes)');
select ok((select count(*) from public.audit_log where entity_id = tests.v('o1')::uuid and action = 'order.paid') = 1, 'paiement manuel journalise dans audit_log');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select is((select count(*) from public.notifications), 7::bigint, 'c1 recoit la commande, ses changements de statut et son invitation a noter');
select is((select count(*) from public.notifications where type = 'order_received'), 1::bigint, 'une nouvelle commande cree une notification de reception');
select tests.as_postgres();
select is((select count(*) from public.notification_email_jobs j
  join public.notifications n on n.id = j.notification_id
  where n.user_id = 'a0000000-0000-0000-0000-000000000006'), 6::bigint, 'les notifications de commande alimentent la file d''e-mails sans bloquer les transitions');
select is((select count(*) from public.notification_email_jobs
  where status = 'queued' and user_id = 'a0000000-0000-0000-0000-000000000006'),
  6::bigint, 'sans webhook configure les e-mails restent en attente');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select count(*) from public.notification_email_jobs$$,
  '42501', null, 'le client ne peut pas lire la file d''e-mails'
);
select throws_ok(
  $$select count(*) from public.notification_email_preferences$$,
  '42501', null, 'le client ne peut pas lire les preferences internes d''e-mail'
);
select lives_ok($$update public.notifications set read_at = now()$$, 'c1 marque ses notifications comme lues');
select throws_ok($$update public.notifications set type = 'x'$$, '42501', null, 'seul read_at est modifiable');
select throws_ok($$delete from public.notifications$$, '42501', null, 'un client ne supprime pas ses notifications');
select throws_ok(
  $$insert into public.notifications (user_id, type) values ('a0000000-0000-0000-0000-000000000006', 'forged')$$,
  '42501', null, 'un client ne cree pas de notifications'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select is((select count(*) from public.notifications where user_id = 'a0000000-0000-0000-0000-000000000006'), 0::bigint, 'c2 ne voit pas les notifications de c1');

-- Limites a la commande : stock, plafond USSD
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select tests.as_postgres();
select lives_ok(
  $$insert into public.cart_items (shop_id, cart_id, product_id, quantity)
    select shop_id, id, 'b0000000-0000-0000-0000-000000000001', 9
    from public.carts
    where customer_id = 'a0000000-0000-0000-0000-000000000006'
      and shop_id = '50000000-0000-0000-0000-000000000001'$$,
  'le test simule un panier devenu obsolète après une baisse de stock'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_orange')$$, 'insufficient_stock%', 'stock insuffisant refuse');
select tests.as_postgres();
select lives_ok($$delete from public.cart_items$$, 'c1 vide son panier');
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    null, 11, null
  )$$,
  'c1 ajoute 11 peintures (165 000 FCFA)'
);
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_orange')$$, 'amount_exceeds_manual_limit%', 'plafond du paiement USSD respecte');
select lives_ok(
  $$select public.set_cart_item_quantity(
    '50000000-0000-0000-0000-000000000001',
    (select ci.id from public.cart_items ci
     join public.carts c on c.id = ci.cart_id
     where c.customer_id = 'a0000000-0000-0000-0000-000000000006'
       and ci.product_id = 'b0000000-0000-0000-0000-000000000002'),
    1, null
  )$$,
  'c1 ramene la quantite a 1 via la RPC'
);

-- Promotions
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select throws_like($$insert into public.coupons (shop_id, code, type, value) values ('50000000-0000-0000-0000-000000000002', 'NOEL', 'percent', 10)$$, 'plan_feature_promotions%', 'les promotions exigent le plan Pro');
select throws_like($$select public.save_coupon('50000000-0000-0000-0000-000000000002', 'NOEL2', 'percent', 10, 0, 1, '{}'::jsonb, true)$$, 'plan_feature_promotions%', 'la RPC refuse une promotion sur le plan gratuit');
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select tests.as_postgres();
update public.products set category_id = 'd0000000-0000-0000-0000-000000000001'
where id = 'b0000000-0000-0000-0000-000000000001';
update public.products set category_id = 'd0000000-0000-0000-0000-000000000002'
where id = 'b0000000-0000-0000-0000-000000000002';
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok($$insert into public.coupons (shop_id, code, type, value) values ('50000000-0000-0000-0000-000000000001', 'PROMO10', 'percent', 10)$$, 'm1 cree un code promo');
select lives_ok($$select public.save_coupon('50000000-0000-0000-0000-000000000001', 'PRODUIT10', 'percent', 10, 0, 1, '{"product_ids":["b0000000-0000-0000-0000-000000000001"],"category_ids":[]}'::jsonb, true)$$, 'la RPC cree un coupon cible sur un produit');
select lives_ok($$select public.save_coupon('50000000-0000-0000-0000-000000000001', 'CATEGORIE10', 'percent', 10, 0, 1, '{"product_ids":[],"category_ids":["d0000000-0000-0000-0000-000000000002"]}'::jsonb, true)$$, 'la RPC cree un coupon cible sur une categorie');
select throws_like($$select public.save_coupon('50000000-0000-0000-0000-000000000001', 'HORSBOUTIQUE', 'percent', 10, 0, 1, '{"product_ids":["b0000000-0000-0000-0000-000000000004"],"category_ids":[]}'::jsonb, true)$$, 'coupon_scope_product_invalid%', 'une portee coupon ne peut pas viser le produit d''une autre boutique');
select throws_like($$select public.save_coupon('50000000-0000-0000-0000-000000000001', 'SCOPEINVALIDE', 'percent', 10, 0, 1, '{"product_ids":"pas-une-liste"}'::jsonb, true)$$, 'coupon_invalid%', 'une portee malformee est refusee sans erreur interne');
select tests.as_postgres();
update public.shop_settings set delivery_enabled = true
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    null, 1, null
  )$$,
  'c1 ajoute un article en stock suivi au panier'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select is(
  (select discount from public.preview_order(
    (select id from public.carts
     where customer_id = 'a0000000-0000-0000-0000-000000000006'
       and shop_id = '50000000-0000-0000-0000-000000000001'),
    'cash_on_delivery', 'pickup', 'PRODUIT10'
  )),
  500,
  'le coupon produit ne réduit que la ligne ciblée'
);
select is(
  (select discount from public.preview_order(
    (select id from public.carts
     where customer_id = 'a0000000-0000-0000-0000-000000000006'
       and shop_id = '50000000-0000-0000-0000-000000000001'),
    'cash_on_delivery', 'pickup', 'CATEGORIE10'
  )),
  1500,
  'le coupon catégorie ne réduit que les produits de cette catégorie'
);
select tests.as_postgres();
insert into ctx values
  ('orders_before_preview', (
    select count(*)::text from public.orders
    where shop_id = '50000000-0000-0000-0000-000000000001'
  )),
  ('stock_before_preview', (
    select stock::text from public.products
    where id = 'b0000000-0000-0000-0000-000000000001'
  )),
  ('coupon_used_before_preview', (
    select used_count::text from public.coupons
    where shop_id = '50000000-0000-0000-0000-000000000001' and code = 'PROMO10'
  )),
  ('redemptions_before_preview', (
    select count(*)::text from public.coupon_redemptions
    where coupon_id = (
      select id from public.coupons
      where shop_id = '50000000-0000-0000-0000-000000000001' and code = 'PROMO10'
    )
  ));
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$insert into ctx values (
    'preview',
    (select jsonb_build_object(
      'subtotal', subtotal, 'discount', discount, 'total', total
    )::text
    from public.preview_order(
      (select id from public.carts
       where customer_id = 'a0000000-0000-0000-0000-000000000006'
         and shop_id = '50000000-0000-0000-0000-000000000001'),
      'cash_on_delivery', 'pickup', 'promo10'
    ))
  )$$,
  'l’aperçu valide un code promo sans créer de commande'
);
select is((tests.v('preview')::jsonb ->> 'subtotal')::integer, 20000, 'aperçu : sous-total exact');
select is((tests.v('preview')::jsonb ->> 'discount')::integer, 2000, 'aperçu : remise exacte');
select is((tests.v('preview')::jsonb ->> 'total')::integer, 18000, 'aperçu : total exact');
select is(
  (select errors from public.preview_order(
    (select id from public.carts
     where customer_id = 'a0000000-0000-0000-0000-000000000006'
       and shop_id = '50000000-0000-0000-0000-000000000001'),
    'cash_on_delivery', 'delivery', 'PROMO10'
  )),
  array[]::text[],
  'l’aperçu accepte la livraison activée sans exiger une adresse avant le formulaire'
);
select is(
  (select errors from public.preview_order(
    (select id from public.carts
     where customer_id = 'a0000000-0000-0000-0000-000000000006'
       and shop_id = '50000000-0000-0000-0000-000000000001'),
    'cash_on_delivery', 'pickup', 'INCONNU'
  )),
  array['coupon_invalid']::text[],
  'l’aperçu retourne les erreurs de code promo'
);
select tests.as_postgres();
select is(
  (select count(*) from public.orders where shop_id = '50000000-0000-0000-0000-000000000001'),
  tests.v('orders_before_preview')::bigint,
  'l’aperçu ne crée pas de commande'
);
select is(
  (select stock from public.products where id = 'b0000000-0000-0000-0000-000000000001'),
  tests.v('stock_before_preview')::integer,
  'l’aperçu ne décrémente pas le stock'
);
select is(
  (select used_count from public.coupons
   where shop_id = '50000000-0000-0000-0000-000000000001' and code = 'PROMO10'),
  tests.v('coupon_used_before_preview')::integer,
  'l’aperçu ne consomme pas le code promo'
);
select is(
  (select count(*) from public.coupon_redemptions
   where coupon_id = (select id from public.coupons
                      where shop_id = '50000000-0000-0000-0000-000000000001'
                        and code = 'PROMO10')),
  tests.v('redemptions_before_preview')::bigint,
  'l’aperçu ne crée pas de redemption'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok($$insert into ctx select 'o3', public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'cash_on_delivery', 'pickup', null, null, 'promo10')::text$$, 'commande avec code promo');
select is(
  (select subtotal from public.orders where id = tests.v('o3')::uuid),
  (tests.v('preview')::jsonb ->> 'subtotal')::integer,
  'la création conserve le sous-total aperçu'
);
select is((select discount from public.orders where id = tests.v('o3')::uuid), 2000, 'remise de 10 % calculee cote serveur');
select is(
  (select discount from public.orders where id = tests.v('o3')::uuid),
  (tests.v('preview')::jsonb ->> 'discount')::integer,
  'la création conserve la remise aperçue'
);
select is((select total from public.orders where id = tests.v('o3')::uuid), 18000, 'total apres remise');
select is(
  (select total from public.orders where id = tests.v('o3')::uuid),
  (tests.v('preview')::jsonb ->> 'total')::integer,
  'la création conserve le total aperçu'
);
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    null, 1, null
  )$$,
  'c1 remplit a nouveau son panier'
);
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'cash_on_delivery', 'pickup', null, null, 'PROMO10')$$, 'coupon_already_used%', 'un code promo n''est utilisable qu''une fois par client');
select throws_like($$select public.create_order_from_cart((select id from public.carts where customer_id = 'a0000000-0000-0000-0000-000000000006' and shop_id = '50000000-0000-0000-0000-000000000001'), 'ussd_moov')$$, 'payment_method_not_available%', 'mode de paiement non propose par la boutique refuse');

-- Expiration automatique
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000004',
    null, 1, null
  )$$,
  'c2 ajoute un article boutique 2 via la RPC'
);
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
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(format($$insert into ctx select 'b4', public.book_slot(%L, %L, %L::timestamptz)::text$$, 'c0000000-0000-0000-0000-000000000001', tests.v('r1'), tests.v('mon9')), 'le client reprend le creneau libere');
select tests.as_postgres();
update public.bookings
set during = tstzrange(now() - interval '2 hours', now() - interval '1 hour', '[)')
where id = tests.v('b4')::uuid;
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(format($$select public.set_booking_status(%L, 'confirmed')$$, tests.v('b4')), 'le commercant confirme le rendez-vous termine');
select lives_ok(format($$select public.set_booking_status(%L, 'completed')$$, tests.v('b4')), 'le commercant termine le rendez-vous');
select tests.as_postgres();
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000007'
     and type = 'review_invitation'
     and payload ->> 'booking_id' = tests.v('b4')),
  1::bigint,
  'un rendez-vous termine envoie une invitation a evaluer'
);

-- =====================================================================
-- F. Avis verifies
-- =====================================================================
select tests.as_postgres();
update public.bookings
set customer_id = 'a0000000-0000-0000-0000-000000000006',
    status = 'completed'
where id in (tests.v('b3')::uuid, tests.v('b4')::uuid);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(format($$insert into public.reviews (shop_id, customer_id, order_id, rating) values (%L, %L, %L, 5)$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o3')), 'review_not_allowed%', 'avis refuse tant que la commande n''est pas terminee');
select lives_ok(format($$insert into public.reviews (shop_id, customer_id, order_id, rating, comment) values (%L, %L, %L, 5, 'Tres bien')$$, '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', tests.v('o1')), 'avis sur commande terminee');
insert into ctx select 'review_id', id::text from public.reviews where order_id = tests.v('o1')::uuid;
select throws_like(
  format(
    $$insert into public.reviews (shop_id, customer_id, booking_id, rating, comment) values (%L, %L, %L, 5, ' tres   bien ')$$,
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    tests.v('b3')
  ),
  'review_spam_repeated%',
  'un commentaire court identique publie dans les dernieres 24h est refuse'
);
select throws_like(
  format(
    $$insert into public.reviews (shop_id, customer_id, booking_id, rating, comment) values (%L, %L, %L, 5, 'Consulte https://example.com')$$,
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    tests.v('b3')
  ),
  'review_contains_link%',
  'les liens sont refuses dans le commentaire d''un avis'
);
select lives_ok(
  format(
    $$insert into public.reviews (shop_id, customer_id, booking_id, rating, comment) values (%L, %L, %L, 4, 'Belle experience')$$,
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    tests.v('b3')
  ),
  'le client peut publier un autre avis admissible dans la limite horaire'
);
select lives_ok(
  format(
    $$insert into public.reviews (shop_id, customer_id, booking_id, rating, comment) values (%L, %L, %L, 4, 'Produit conforme')$$,
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    tests.v('b4')
  ),
  'un deuxieme avis distinct reste dans la limite de trois par heure'
);
select throws_like(
  format(
    $$insert into public.reviews (shop_id, customer_id, booking_id, rating, comment) values (%L, %L, %L, 4, 'Très bon service')$$,
    '50000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000006',
    tests.v('b3')
  ),
  'review_rate_limited%',
  'le quatrieme avis dans la meme heure est limite'
);
delete from public.reviews where booking_id in (tests.v('b3')::uuid, tests.v('b4')::uuid);
select tests.as_postgres();
delete from private.review_submission_limits
where customer_id = 'a0000000-0000-0000-0000-000000000006';
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  format(
    $$insert into storage.objects (bucket_id, name, owner) values ('review-photos', %L, %L)$$,
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    'a0000000-0000-0000-0000-000000000006'
  ),
  'le client ajoute une photo dans le dossier de son avis'
);
select lives_ok(
  format(
    $$update public.reviews set photo_paths = array[%L] where id = %L::uuid$$,
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    tests.v('review_id')
  ),
  'la photo existante est associee a l''avis'
);
select throws_like(
  format(
    $$update public.reviews set photo_paths = array[%L,%L,%L,%L] where id = %L::uuid$$,
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    '50000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000006/' || tests.v('review_id') || '/e0000000-0000-0000-0000-000000000001.webp',
    tests.v('review_id')
  ),
  'review_photo_limit%',
  'un avis ne peut pas contenir plus de trois photos'
);
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
select is(
  (select count(*) from public.storefront_reviews(
    '50000000-0000-0000-0000-000000000001', null, 20
  )),
  1::bigint,
  'la RPC publique renvoie les avis publies de la boutique'
);
select is(
  (select count(*) from public.storefront_reviews(
    '50000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    20
  )),
  1::bigint,
  'la RPC publique filtre les avis par produit achete'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select lives_ok(format($$select public.report_review(%L, 'Avis inapproprie')$$, (select id::text from public.reviews limit 1)), 'un autre client peut signaler un avis public');
select throws_like(format($$select public.report_review(%L, 'Avis inapproprie')$$, (select id::text from public.reviews limit 1)), 'review_already_reported%', 'un meme client ne signale pas deux fois le meme avis');
select is((select count(*) from public.review_reports), 0::bigint, 'les signalements restent invisibles aux clients');
select is((select count(*) from public.review_moderation_history), 0::bigint, 'l''historique de modération reste privé pour les clients');
select throws_ok(
  format(
    $$select public.moderate_review(%L, 'hidden', 'Motif de test')$$,
    (select id::text from public.reviews limit 1)
  ),
  '42501',
  null,
  'un client ne peut pas modérer un avis'
);
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select is((select count(*) from public.review_reports where status = 'open'), 1::bigint, 'le signalement est visible au back-office admin');
select lives_ok(format($$select public.moderate_review(%L, 'hidden', 'Avis contraire aux règles')$$, (select id::text from public.reviews limit 1)), 'l''admin masque un avis via moderate_review');
select is((select new_status::text from public.review_moderation_history order by created_at desc limit 1), 'hidden', 'le changement de statut est ajouté a l''historique');
select is((select reason from public.review_moderation_history order by created_at desc limit 1), 'Avis contraire aux règles', 'le motif de modération est conservé');
select is((select count(*) from public.review_moderation_history), 1::bigint, 'une seule entrée est créée pour cette décision');
select lives_ok(format($$select public.resolve_review_report(%L, 'resolved')$$, (select id::text from public.review_reports limit 1)), 'l''admin peut clôturer le signalement apres sa décision');
select is((select status::text from public.reviews limit 1), 'hidden', 'la clôture du signalement ne modifie pas le statut choisi par l''admin');
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
select lives_ok($$select public.seed_catalog_samples(
  '50000000-0000-0000-0000-000000000003',
  '{"products":[{"name":"Exemple non réel","price":2000,"category_name":"Démo"}],"services":[]}'::jsonb
)$$, 'les exemples sont charges dans la boutique en brouillon');
select throws_like($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'missing_catalog%', 'les exemples seuls ne satisfont pas les conditions de soumission');
select lives_ok($$select public.save_catalog_product('50000000-0000-0000-0000-000000000003', jsonb_build_object('name', 'Article', 'price', 2000, 'status', 'available', 'variants', '[]'::jsonb))$$, 'm2 ajoute un produit via RPC');
select throws_like($$select public.submit_shop_for_review('50000000-0000-0000-0000-000000000003')$$, 'missing_payment_method%', 'soumission : un mode d''encaissement requis');
select throws_ok(
  $$select public.save_onboarding_payment_methods(
    '50000000-0000-0000-0000-000000000001',
    '[{"type":"pay_at_pickup"}]'::jsonb
  )$$,
  '42501', null, 'un proprietaire ne configure pas les paiements d''une autre boutique'
);
select throws_like(
  $$select public.save_onboarding_payment_methods(
    '50000000-0000-0000-0000-000000000003',
    '[{"type":"ussd_orange","phone":"123","ussdTemplate":"*144#"}]'::jsonb
  )$$,
  '%invalid_payment_methods%', 'un numero USSD non valide est refuse'
);
select throws_ok(
  $$insert into public.shop_payment_methods (shop_id, type, phone_or_code)
    values ('50000000-0000-0000-0000-000000000003', 'ussd_orange', '+22670333333')$$,
  '42501', null, 'les modes de paiement ne sont pas modifiables directement'
);
select lives_ok(
  $$select public.save_onboarding_payment_methods(
    '50000000-0000-0000-0000-000000000003',
    '[{"type":"ussd_orange","phone":"70333333","ussdTemplate":"*144#"},{"type":"pay_at_pickup"}]'::jsonb
  )$$,
  'm2 configure des modes USSD et retrait via RPC'
);
select tests.as_postgres();
select is(
  (select phone_or_code from public.shop_payment_methods
   where shop_id = '50000000-0000-0000-0000-000000000003'
     and type = 'ussd_orange'),
  '+22670333333',
  'le numero Orange est normalise au format international burkinabe'
);
select tests.as_user('a0000000-0000-0000-0000-000000000003');
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
select lives_ok($$insert into storage.objects (bucket_id, name, owner) values ('profile-avatars', 'a0000000-0000-0000-0000-000000000006/avatar.webp', 'a0000000-0000-0000-0000-000000000006')$$, 'un client envoie son avatar');
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('profile-avatars', 'a0000000-0000-0000-0000-000000000006/faux.webp', 'a0000000-0000-0000-0000-000000000007')$$, '42501', null, 'un client ne peut pas envoyer un avatar dans le dossier d''un autre');
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

-- =====================================================================
-- K. Invitations et permissions d'equipe
-- =====================================================================
select tests.as_user('a0000000-0000-0000-0000-000000000004');
select throws_ok(
  $$select public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000001',
    'c1@test.bf',
    repeat('a', 64),
    '{"catalog":true}'::jsonb
  )$$,
  '42501', null, 'un employe ne peut pas inviter'
);
select throws_ok(
  $$select public.list_shop_team('50000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'un employe ne peut pas consulter la liste de l''equipe'
);
select throws_ok(
  $$update public.shop_members set permissions = '{"payments":true}' where user_id = 'a0000000-0000-0000-0000-000000000004'$$,
  '42501', null, 'un employe ne modifie pas directement ses permissions'
);

select tests.as_user('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000002',
    'c1@test.bf',
    repeat('b', 64),
    '{}'::jsonb
  )$$,
  '42501', null, 'un proprietaire ne peut pas inviter dans une autre boutique'
);
select lives_ok(
  $$insert into ctx select 'invite_c1', public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000001',
    'c1@test.bf',
    repeat('c', 64),
    '{"catalog":true,"orders":false}'::jsonb
  )::text$$,
  'le proprietaire cree une invitation avec les permissions demandees'
);
select is(
  (select count(id) from public.shop_invitations where shop_id = '50000000-0000-0000-0000-000000000001'),
  1::bigint,
  'le proprietaire voit les invitations de sa boutique'
);
select throws_like(
  $$select public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000001',
    'c1@test.bf',
    repeat('d', 64),
    '{"admin":true}'::jsonb
  )$$,
  '%invalid_invitation%', 'les permissions non autorisees sont refusees'
);
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select is(
  (select count(id) from public.shop_invitations where shop_id = '50000000-0000-0000-0000-000000000001'),
  0::bigint,
  'un proprietaire ne voit pas les invitations d''une autre boutique'
);
select lives_ok(
  $$insert into ctx select 'invite_c2', public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000002',
    'c2@test.bf',
    repeat('e', 64),
    '{"bookings":true}'::jsonb
  )::text$$,
  'le proprietaire de la deuxieme boutique cree une invitation'
);
select lives_ok(
  $$insert into ctx select 'invite_free', public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000003',
    'c2@test.bf',
    repeat('3', 64),
    '{}'::jsonb
  )::text$$,
  'la premiere invitation reserve une place dans le plan gratuit'
);
select throws_like(
  $$select public.create_shop_invitation(
    '50000000-0000-0000-0000-000000000003',
    'c1@test.bf',
    repeat('f', 64),
    '{}'::jsonb
  )$$,
  '%plan_limit_staff%', 'les invitations en attente consomment les places du plan gratuit'
);

select lives_ok(
  $$select public.rotate_shop_invitation_token(
    '50000000-0000-0000-0000-000000000002',
    tests.v('invite_c2')::uuid,
    repeat('2', 64)
  )$$,
  'le proprietaire peut tourner le jeton d''une invitation en attente'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_like(
  $$select public.accept_shop_invitation(repeat('e', 64))$$,
  '%invitation_invalid_or_used%', 'l''ancien jeton est invalide apres rotation'
);

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(
  $$select public.accept_shop_invitation(repeat('2', 64))$$,
  '%invitation_email_mismatch%', 'seule l''adresse invitee peut accepter'
);
select lives_ok(
  $$select public.accept_shop_invitation(repeat('c', 64))$$,
  'le compte invite accepte l''invitation'
);
select throws_like(
  $$select public.accept_shop_invitation(repeat('c', 64))$$,
  '%invitation_invalid_or_used%', 'un jeton ne peut pas etre utilise deux fois'
);
select tests.as_postgres();
select is(
  (select status from public.shop_invitations where id = tests.v('invite_c1')::uuid),
  'accepted',
  'l''invitation est marquee comme acceptee'
);
select is(
  (select permissions from public.shop_members where shop_id = '50000000-0000-0000-0000-000000000001' and user_id = 'a0000000-0000-0000-0000-000000000006'),
  '{"catalog":true,"orders":false}'::jsonb,
  'les permissions choisies sont attribuees a l''employe'
);
select tests.as_postgres();
select lives_ok(
  $$update public.shop_invitations
    set created_at = now() - interval '8 days', expires_at = now() - interval '1 minute'
    where id = tests.v('invite_c2')::uuid$$,
  'le test marque une invitation comme expiree'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_like(
  $$select public.accept_shop_invitation(repeat('2', 64))$$,
  '%invitation_expired%', 'une invitation expiree ne peut pas etre acceptee'
);

-- ---------- Demandes client d'annulation et remboursement ----------
select tests.as_postgres();
insert into public.orders (
  id, shop_id, customer_id, status, payment_method, fulfillment,
  subtotal, discount, total
) values
  ('90000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000006', 'payment_declared', 'ussd_orange', 'pickup', 1000, 0, 1000),
  ('90000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000006', 'payment_declared', 'ussd_orange', 'pickup', 1000, 0, 1000);
insert into public.payment_declarations (shop_id, order_id, payer_phone, transaction_ref)
values
  ('50000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '+22670000006', 'CANCELREF01'),
  ('50000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', '+22670000006', 'CANCELREF02');

select tests.as_user('a0000000-0000-0000-0000-000000000007');
select throws_like(
  $$select public.request_order_cancellation('90000000-0000-0000-0000-000000000001', null)$$,
  '%forbidden%', 'un autre client ne peut pas ouvrir une demande'
);
select is(
  (select count(*) from public.order_cancellation_requests),
  0::bigint, 'un client ne lit aucune demande appartenant a un autre client'
);

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$insert into ctx values (
    'cancel_request_refund',
    public.request_order_cancellation('90000000-0000-0000-0000-000000000001', 'Je ne peux plus venir')::text
  )$$,
  'le client ouvre une demande pour une commande avec paiement declare'
);
select throws_ok(
  $$insert into public.order_cancellation_requests (
    shop_id, order_id, customer_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000006'
  )$$,
  '42501', null, 'le client ne peut pas creer directement une demande'
);
select throws_like(
  $$select public.request_order_cancellation('90000000-0000-0000-0000-000000000001', null)$$,
  '%cancellation_request_already_pending%', 'une seule demande peut rester en attente par commande'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select is(
  (select count(*) from public.order_cancellation_requests),
  0::bigint, 'un autre client ne voit pas la demande'
);
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select is(
  (select count(*) from public.order_cancellation_requests),
  0::bigint, 'un commercant d''une autre boutique ne voit pas la demande'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_like(
  format(
    $$select public.resolve_order_cancellation_request(%L, 'rejected', 'non')$$,
    tests.v('cancel_request_refund')
  ),
  '%forbidden%', 'le client ne peut pas resoudre sa demande'
);
select tests.as_user('a0000000-0000-0000-0000-000000000005');
select throws_like(
  format(
    $$select public.resolve_order_cancellation_request(%L, 'rejected', 'non')$$,
    tests.v('cancel_request_refund')
  ),
  '%forbidden%', 'un employe sans permission commandes ne peut pas resoudre'
);

select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is(
  (select count(*) from public.order_cancellation_requests),
  1::bigint, 'le proprietaire voit la demande de sa boutique'
);
select throws_like(
  format(
    $$select public.resolve_order_cancellation_request(%L, null, null, null)$$,
    tests.v('cancel_request_refund')
  ),
  '%invalid_cancellation_resolution%', 'une resolution NULL est refusee'
);
select throws_like(
  format(
    $$select public.resolve_order_cancellation_request(%L, 'refunded', 'Rembourse')$$,
    tests.v('cancel_request_refund')
  ),
  '%refund_reference_required%', 'un remboursement USSD sans reference est refuse'
);
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000001'),
  'payment_declared', 'un remboursement refuse sans reference ne modifie pas la commande'
);
select lives_ok(
  format(
    $$select public.resolve_order_cancellation_request(%L, 'refunded', 'Rembourse par USSD', 'REFUND-01')$$,
    tests.v('cancel_request_refund')
  ),
  'le proprietaire confirme le remboursement avec sa reference'
);
select tests.as_postgres();
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000001'),
  'refunded', 'la commande declaree est payee puis remboursee atomiquement'
);
select is(
  (select count(*) from public.order_status_history
   where order_id = '90000000-0000-0000-0000-000000000001'
     and (from_status, to_status) in (('payment_declared', 'paid'), ('paid', 'refunded'))),
  2::bigint, 'les deux transitions de paiement et remboursement sont historisees'
);
select is(
  (select status::text from public.order_cancellation_requests where id = tests.v('cancel_request_refund')::uuid),
  'refunded', 'la demande est marquee remboursee'
);

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$insert into ctx values (
    'cancel_request_unpaid',
    public.request_order_cancellation('90000000-0000-0000-0000-000000000002', null)::text
  )$$,
  'le client ouvre une seconde demande'
);
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  format(
    $$select public.resolve_order_cancellation_request(%L, 'cancelled', 'Paiement non recu')$$,
    tests.v('cancel_request_unpaid')
  ),
  'le commercant annule sans remboursement apres avoir confirme l''absence de paiement'
);
select tests.as_postgres();
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000002'),
  'cancelled', 'la commande sans paiement est annulee'
);
select is(
  (select status::text from public.order_cancellation_requests where id = tests.v('cancel_request_unpaid')::uuid),
  'cancelled', 'la demande sans paiement est resolue'
);

-- ---------- Rappels cron et traitement idempotent des webhooks ----------
select tests.as_postgres();
insert into public.orders (
  id, shop_id, customer_id, status, payment_method, fulfillment, subtotal, discount, total
) values (
  '90000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000006',
  'payment_declared', 'ussd_orange', 'pickup', 1000, 0, 1000
);
insert into public.order_status_history (
  shop_id, order_id, from_status, to_status, actor_type
) values (
  '50000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000003',
  'pending_payment', 'payment_declared', 'customer'
);
select is(
  public.remind_pending_declarations(), 0,
  'aucun rappel avant deux heures apres la declaration'
);
update public.order_status_history
set created_at = now() - interval '3 hours'
where order_id = '90000000-0000-0000-0000-000000000003'
  and to_status = 'payment_declared';
select is(
  public.remind_pending_declarations(), 1,
  'le rappel commerçant de deux heures est cree'
);
select is(
  public.remind_pending_declarations(), 0,
  'le rappel de deux heures n''est pas emis deux fois'
);
update public.order_status_history
set created_at = now() - interval '25 hours'
where order_id = '90000000-0000-0000-0000-000000000003'
  and to_status = 'payment_declared';
select is(
  public.remind_pending_declarations(), 1,
  'le second rappel commerçant est cree apres vingt-quatre heures'
);
update public.order_status_history
set created_at = now() - interval '73 hours'
where order_id = '90000000-0000-0000-0000-000000000003'
  and to_status = 'payment_declared';
select is(
  public.remind_pending_declarations(), 1,
  'l''alerte administrateur est creee apres soixante-douze heures'
);
select is(
  (select count(*) from public.notifications
   where type = 'order_declaration_reminder'
     and payload ->> 'order_code' = (
       select code from public.orders where id = '90000000-0000-0000-0000-000000000003'
     )),
  4::bigint,
  'les rappels 2h et 24h touchent le proprietaire et l''employe commandes'
);
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000001'
     and type = 'admin_order_declaration_overdue'
     and payload ->> 'order_code' = (
       select code from public.orders where id = '90000000-0000-0000-0000-000000000003'
     )),
  1::bigint,
  'l''administrateur reçoit une seule alerte apres 72h'
);
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000003'),
  'payment_declared',
  'les rappels ne changent jamais le statut payment_declared'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select * from private.order_declaration_reminders$$,
  '42501', null, 'la table de deduplication des rappels est privee'
);
select tests.as_postgres();
select is(
  (select count(*) from cron.job
   where jobname in (
     'expire-pending-orders',
     'remind-pending-declarations',
     'reconcile-stale-aggregator-payments',
     'monitor-order-cron-jobs',
     'process-booking-reminders',
     'monitor-booking-reminder-cron'
   )),
  6::bigint,
  'les six tâches cron sont planifiees'
);

insert into public.orders (
  id, shop_id, customer_id, status, payment_method, fulfillment, subtotal, discount, total
) values
  ('90000000-0000-0000-0000-000000000004',
   '50000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000006',
   'pending_payment', 'aggregator', 'pickup', 2000, 0, 2000),
  ('90000000-0000-0000-0000-000000000005',
   '50000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000006',
   'pending_payment', 'aggregator', 'pickup', 3000, 0, 3000);
insert into public.payments (
  id, shop_id, order_id, provider, idempotency_key, amount, status
) values
  ('a9000000-0000-0000-0000-000000000001',
   '50000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000004',
   'fake', 'e2e-payment-pending', 2000, 'pending'),
  ('a9000000-0000-0000-0000-000000000002',
   '50000000-0000-0000-0000-000000000001',
   '90000000-0000-0000-0000-000000000005',
   'fake', 'e2e-payment-confirmed', 3000, 'pending');
select throws_ok(
  $$insert into public.payments (
    shop_id, order_id, provider, idempotency_key, amount
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000004',
    'fake', 'e2e-payment-pending', 2000
  )$$,
  '23505', null, 'une cle d''idempotence ne peut pas creer un second paiement'
);

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.process_aggregator_webhook(
    'fake', 'unauthorized-event', 'a9000000-0000-0000-0000-000000000002',
    'fake-ref-2', 'succeeded', '{}'::jsonb
  )$$,
  '42501', null, 'un client ne peut pas traiter un webhook agrégateur'
);
select tests.as_service();
select is(
  public.process_aggregator_webhook(
    'fake', 'event-pending-1', 'a9000000-0000-0000-0000-000000000001',
    'fake-ref-1', 'pending', '{"source":"test"}'::jsonb
  ),
  'recorded',
  'un statut fournisseur non confirme est enregistre sans payer la commande'
);
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000004'),
  'pending_payment',
  'un statut fournisseur non confirme ne change pas la commande'
);
select is(
  public.process_aggregator_webhook(
    'fake', 'event-pending-1', 'a9000000-0000-0000-0000-000000000001',
    'fake-ref-1', 'pending', '{"source":"test"}'::jsonb
  ),
  'duplicate',
  'la relecture d''un webhook deja traite est ignoree'
);
select is(
  public.process_aggregator_webhook(
    'fake', 'event-succeeded-1', 'a9000000-0000-0000-0000-000000000002',
    'fake-ref-2', 'succeeded', '{"source":"test"}'::jsonb
  ),
  'paid',
  'un statut confirme par le fournisseur paie via transition_order'
);
select is(
  public.process_aggregator_webhook(
    'fake', 'event-succeeded-1', 'a9000000-0000-0000-0000-000000000002',
    'fake-ref-2', 'succeeded', '{"source":"test"}'::jsonb
  ),
  'duplicate',
  'un webhook confirme rejoue ne cree pas une seconde transition'
);
select tests.as_postgres();
select is(
  (select status::text from public.orders where id = '90000000-0000-0000-0000-000000000005'),
  'paid',
  'la commande payee par webhook a un statut final coherent'
);
select is(
  (select count(*) from public.order_status_history
   where order_id = '90000000-0000-0000-0000-000000000005'
     and to_status = 'paid'),
  1::bigint,
  'le webhook idempotent ajoute une seule transition a l''historique'
);

-- ---------- Limitation de débit des Edge Functions ----------
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select * from public.consume_edge_rate_limit(
    'login:ip', repeat('a', 64), 1, 60
  )$$,
  '42501', null, 'un compte client ne peut pas consommer le compteur Edge'
);
select tests.as_service();
select is(
  (select allowed from public.consume_edge_rate_limit(
    'login:ip', repeat('b', 64), 1, 60
  )),
  true,
  'la premiere requete respecte le quota'
);
select is(
  (select allowed from public.consume_edge_rate_limit(
    'login:ip', repeat('b', 64), 1, 60
  )),
  false,
  'la requete suivante depasse le quota'
);
select ok(
  (select retry_after >= 1 from public.consume_edge_rate_limit(
    'login:ip', repeat('b', 64), 1, 60
  )),
  'le compteur fournit un delai de reprise positif'
);
select is(
  (select allowed from public.consume_edge_rate_limit(
    'login:user', repeat('b', 64), 1, 60
  )),
  true,
  'les compteurs IP et utilisateur sont independants'
);
select throws_ok(
  $$select * from public.consume_edge_rate_limit(
    'invalid', repeat('b', 64), 1, 60
  )$$,
  '22023', null, 'une categorie de compteur inconnue est rejetee'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select * from private.edge_rate_limit_counters$$,
  '42501', null, 'un client ne peut pas lire les compteurs IP'
);
select tests.as_service();
select throws_ok(
  $$select * from private.edge_rate_limit_counters$$,
  '42501', null, 'service_role ne lit les compteurs que par la RPC'
);

-- ---------- Abonnements et generation des factures ----------
select tests.as_postgres();
update public.subscriptions
set plan_id = (select id from public.plans where code = 'pro'),
    status = 'active',
    current_period_end = now() + interval '6 days'
where shop_id = '50000000-0000-0000-0000-000000000001';
update public.subscriptions
set current_period_end = now() + interval '6 days'
where shop_id = '50000000-0000-0000-0000-000000000002';
update public.subscriptions
set plan_id = (select id from public.plans where code = 'pro'),
    status = 'active',
    current_period_end = now() + interval '8 days'
where shop_id = '50000000-0000-0000-0000-000000000003';
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is(
  public.catalog_product_limit('50000000-0000-0000-0000-000000000001'),
  null::integer,
  'le proprietaire consulte la limite produit illimitee de son plan Pro'
);
select is(
  public.shop_staff_limit('50000000-0000-0000-0000-000000000001'),
  3,
  'la limite d''equipe provient du plan actif en base'
);
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select is(
  public.catalog_product_limit('50000000-0000-0000-0000-000000000002'),
  15,
  'le plan Gratuit expose sa limite produit de quinze'
);
select tests.as_postgres();
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.generate_due_invoices()$$,
  '42501', null, 'un client ne peut pas generer les factures'
);
select tests.as_service();
select is(
  public.generate_due_invoices(),
  1,
  'une facture payante est generee sept jours avant echeance'
);
select is(
  (select count(*) from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  1::bigint,
  'une seule facture est creee pour la periode'
);
select is(
  (select amount from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  7500,
  'le montant correspond au tarif mensuel du plan Pro'
);
select is(
  (select status::text from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'open',
  'la facture est ouverte au moment de sa creation'
);
select is(
  (select invoice_number from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  1::bigint,
  'la premiere facture recoit un numero sequentiel'
);
select ok(
  (select period_start < period_end
      and period_start = period_end - interval '1 month'
      and due_at = period_end
   from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'la facture couvre une periode mensuelle et arrive a echeance en fin de periode'
);
select is(
  public.generate_due_invoices(),
  0,
  'relancer la generation ne cree pas de doublon'
);
select tests.as_postgres();
select is(
  (select count(*) from public.invoices
   where shop_id in (
     '50000000-0000-0000-0000-000000000002',
     '50000000-0000-0000-0000-000000000003'
   )),
  0::bigint,
  'les plans gratuits et les echeances a plus de sept jours ne sont pas factures'
);
select ok(
  exists (select 1 from cron.job where jobname = 'generate-due-invoices'),
  'la generation quotidienne des factures est planifiee'
);
select tests.as_user('a0000000-0000-0000-0000-000000000004');
select is(
  (select count(*) from public.invoices),
  0::bigint,
  'un employe ne voit pas les factures de sa boutique'
);
select tests.as_postgres();
update public.invoices
set pdf_path = shop_id::text || '/' || id::text || '.pdf'
where shop_id = '50000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name, owner)
select 'subscription-receipts', pdf_path, 'a0000000-0000-0000-0000-000000000002'
from public.invoices
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_anon();
select is(
  (select count(*) from storage.objects
   where bucket_id = 'subscription-receipts'),
  0::bigint,
  'les fichiers de factures ne sont pas publics'
);
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is(
  (select count(*) from storage.objects
   where bucket_id = 'subscription-receipts'),
  1::bigint,
  'le proprietaire accede au PDF de sa facture'
);
select tests.as_user('a0000000-0000-0000-0000-000000000004');
select is(
  (select count(*) from storage.objects
   where bucket_id = 'subscription-receipts'),
  0::bigint,
  'un employe ne peut pas acceder au PDF de la facture'
);
select tests.as_user('a0000000-0000-0000-0000-000000000003');
select is(
  (select count(*) from storage.objects
   where bucket_id = 'subscription-receipts'),
  0::bigint,
  'un autre commercant ne voit pas le PDF de cette facture'
);
select tests.as_user('a0000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from storage.objects
   where bucket_id = 'subscription-receipts'),
  1::bigint,
  'un administrateur accede au PDF de la facture'
);
select tests.as_postgres();
insert into public.invoices (
  shop_id, plan_id, amount, status, period_start, period_end, due_at
)
select
  shop_id,
  plan_id,
  amount,
  'void',
  period_start - interval '2 months',
  period_start - interval '1 month',
  period_start - interval '1 month'
from public.invoices
where shop_id = '50000000-0000-0000-0000-000000000001'
limit 1;
select is(
  (select invoice_number from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'
     and status = 'void'),
  2::bigint,
  'la facture suivante recoit le numero suivant, meme si elle est annulee'
);
select ok(
  (select max(invoice_number) - min(invoice_number) + 1 = count(*)
   from public.invoices
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'la numerotation conserve les numeros des factures annulees sans trou'
);
select throws_ok(
  $$update public.invoices set invoice_number = 99
    where shop_id = '50000000-0000-0000-0000-000000000001'
      and status = 'open'$$,
  'P0001', null, 'le numero d''une facture ne peut pas etre modifie'
);
select throws_ok(
  $$delete from public.invoices
    where shop_id = '50000000-0000-0000-0000-000000000001'
      and status = 'open'$$,
  'P0001', null, 'une facture ne peut pas etre supprimee'
);
select tests.as_user('a0000000-0000-0000-0000-000000000002');
select is(
  (select count(*) from public.invoices),
  2::bigint,
  'le proprietaire voit toutes les factures de sa boutique'
);

-- ---------- Cycle de vie des abonnements ----------
select tests.as_postgres();
insert into public.products (
  shop_id, name, price, status, created_at
)
select
  '50000000-0000-0000-0000-000000000001',
  'Plan overflow ' || series,
  1000,
  'available',
  now() + interval '100 days' + make_interval(secs => series)
from generate_series(1, 16) as series;
insert into ctx
select 'plan_hidden_product', id::text
from public.products
where shop_id = '50000000-0000-0000-0000-000000000001'
  and name = 'Plan overflow 16';
update public.products
set created_at = now() - interval '1 year'
where id = 'b0000000-0000-0000-0000-000000000001';
insert into public.carts (shop_id, customer_id)
values (
  '50000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000007'
)
on conflict (shop_id, customer_id) do nothing;
insert into public.cart_items (cart_id, shop_id, product_id, quantity)
select cart.id, cart.shop_id, product.id, 1
from public.carts cart
join public.products product
  on product.shop_id = cart.shop_id
  and product.name = 'Plan overflow 16'
where cart.shop_id = '50000000-0000-0000-0000-000000000001'
  and cart.customer_id = 'a0000000-0000-0000-0000-000000000007';
insert into public.orders (
  id, shop_id, customer_id, payment_method, subtotal, total
) values (
  '90000000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000006',
  'ussd_orange',
  1000,
  1000
);
update public.subscriptions
set status = 'active',
    plan_id = (select id from public.plans where code = 'pro'),
    current_period_end = now() + interval '6 days 12 hours',
    grace_until = null
where shop_id = '50000000-0000-0000-0000-000000000001';

select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  $$select public.process_subscription_lifecycle()$$,
  '42501', null, 'un client ne peut pas exécuter le cycle de vie'
);
select tests.as_service();
select is(
  public.process_subscription_lifecycle(),
  1,
  'un rappel J-7 est envoyé pour l’abonnement payant'
);
select tests.as_postgres();
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000002'
     and type = 'subscription_reminder'
     and payload ->> 'reminder_key' = '7_days'),
  1::bigint,
  'le rappel J-7 crée une notification pour le propriétaire'
);
select is(
  (select count(*) from public.notification_email_jobs jobs
   join public.notifications notification on notification.id = jobs.notification_id
   where notification.type = 'subscription_reminder'
     and notification.payload ->> 'reminder_key' = '7_days'),
  1::bigint,
  'le rappel J-7 est également placé dans la file e-mail'
);
select tests.as_service();
select is(
  public.process_subscription_lifecycle(),
  0,
  'relancer le cycle ne duplique pas le rappel J-7'
);
select tests.as_postgres();
update public.subscriptions
set current_period_end = now() + interval '2 days 12 hours'
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_service();
select is(
  public.process_subscription_lifecycle(),
  1,
  'un rappel J-3 est envoyé dans sa fenêtre'
);
select tests.as_postgres();
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000002'
     and type = 'subscription_reminder'
     and payload ->> 'reminder_key' = '3_days'),
  1::bigint,
  'le rappel J-3 est bien notifié'
);
update public.subscriptions
set current_period_end = now() - interval '1 hour',
    grace_until = null
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_service();
select is(
  public.process_subscription_lifecycle(),
  2,
  'à échéance, le plan passe en retard et le rappel J0 est envoyé'
);
select tests.as_postgres();
select is(
  (select status::text from public.subscriptions
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'past_due',
  'l’abonnement passe à past_due à son échéance'
);
select ok(
  (select grace_until = current_period_end + interval '7 days'
   from public.subscriptions
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'la période de grâce dure exactement sept jours'
);
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000002'
     and type = 'subscription_reminder'
     and payload ->> 'reminder_key' = 'due'),
  1::bigint,
  'le rappel J0 est envoyé une seule fois'
);
select tests.as_service();
select is(
  public.process_subscription_lifecycle(),
  0,
  'relancer le cycle ne duplique pas le rappel J0'
);
select tests.as_postgres();
update public.subscriptions
set status = 'past_due',
    current_period_end = now() - interval '8 days',
    grace_until = now() - interval '1 second'
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_service();
select ok(
  public.process_subscription_lifecycle() > 0,
  'le cycle expire un abonnement après la période de grâce'
);
select tests.as_postgres();
select is(
  (select status::text from public.subscriptions
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  'expired',
  'l’abonnement passe à expired après sept jours de grâce'
);
select is(
  (select count(*) from public.products
   where shop_id = '50000000-0000-0000-0000-000000000001'
     and not is_sample and deleted_at is null and not hidden_by_plan),
  15::bigint,
  'seuls les quinze produits les plus anciens restent visibles sous le plan Gratuit'
);
select ok(
  (select count(*) > 0 from public.products
   where shop_id = '50000000-0000-0000-0000-000000000001'
     and hidden_by_plan and deleted_at is null),
  'les produits au-delà du quota sont marqués sans être supprimés'
);
select is(
  (select hidden_by_plan from public.products
   where id = 'b0000000-0000-0000-0000-000000000001'),
  false,
  'les produits les plus anciens sont conservés en priorité'
);
select is(
  (select status::text from public.orders
   where id = '90000000-0000-0000-0000-000000000010'),
  'pending_payment',
  'la rétrogradation ne bloque pas une commande en cours'
);
select tests.as_user('a0000000-0000-0000-0000-000000000007');
select ok(
  coalesce(
    (select not can_order and product_name = 'Article indisponible'
     from public.get_cart_snapshot(
       '50000000-0000-0000-0000-000000000001',
       null
     )
     where product_id = tests.v('plan_hidden_product')::uuid),
    false
  ),
  'un produit masqué devient indisponible dans un panier existant'
);
select ok(
  coalesce(
    (select errors[1] like 'product_unavailable:%'
     from public.preview_order(
       (select id from public.carts
        where shop_id = '50000000-0000-0000-0000-000000000001'
          and customer_id = 'a0000000-0000-0000-0000-000000000007'),
       'ussd_orange',
       'pickup',
       null
     )),
    false
  ),
  'la vérification de commande refuse un produit masqué déjà au panier'
);
select throws_like(
  $$select public.add_cart_item(
    '50000000-0000-0000-0000-000000000001',
    tests.v('plan_hidden_product')::uuid,
    null, 1, null
  )$$,
  '%product_unavailable%',
  'un produit masqué ne peut pas être ajouté à un panier'
);
select tests.as_postgres();
select ok(
  exists (
    select 1 from public.audit_log
    where shop_id = '50000000-0000-0000-0000-000000000001'
      and action = 'subscription.past_due'
  )
  and exists (
    select 1 from public.audit_log
    where shop_id = '50000000-0000-0000-0000-000000000001'
      and action = 'subscription.expired'
  ),
  'les transitions d’abonnement sont journalisées'
);
select tests.as_anon();
select ok(
  (select count(*) < 16 from public.products
   where shop_id = '50000000-0000-0000-0000-000000000001'
     and name like 'Plan overflow %'),
  'les produits masqués par le plan restent invisibles publiquement'
);
select throws_ok(
  $$select hidden_by_plan from public.products limit 1$$,
  '42501', null, 'un visiteur ne peut pas lire le marqueur interne du plan'
);
select tests.as_postgres();
update public.subscriptions
set plan_id = (select id from public.plans where code = 'pro'),
    status = 'active',
    current_period_end = now() + interval '30 days',
    grace_until = null
where shop_id = '50000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.products
   where shop_id = '50000000-0000-0000-0000-000000000001'
     and hidden_by_plan),
  0::bigint,
  'la réactivation restaure automatiquement les produits masqués'
);
select is(
  (select count(*) from public.orders
   where id = '90000000-0000-0000-0000-000000000010'),
  1::bigint,
  'aucune donnée de commande n’est perdue pendant le cycle de vie'
);
select ok(
  exists (select 1 from cron.job
          where jobname = 'process-subscription-lifecycle'),
  'le cycle de vie est planifié toutes les cinq minutes'
);
select ok(
  position(
    'process-subscription-lifecycle'
    in pg_get_functiondef('public.monitor_order_cron_jobs()'::regprocedure)
  ) > 0,
  'la surveillance cron inclut le cycle de vie des abonnements'
);

-- ---------- Rappels et annulation securisee des rendez-vous ----------
select tests.as_postgres();
select is(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = 'bookings'),
  1::bigint,
  'les rendez-vous sont publies pour la mise a jour en temps reel'
);
select is(
  public.process_booking_reminders(
    (select lower(during) - interval '24 hours'
     from public.bookings where id = tests.v('b2')::uuid)
  ),
  1,
  'un rappel J-1 est cree pour le rendez-vous actif'
);
select is(
  public.process_booking_reminders(
    (select lower(during) - interval '24 hours'
     from public.bookings where id = tests.v('b2')::uuid)
  ),
  0,
  'le rappel J-1 ne se duplique pas apres relance'
);
select is(
  public.process_booking_reminders(
    (select lower(during) - interval '2 hours'
     from public.bookings where id = tests.v('b2')::uuid)
  ),
  1,
  'un rappel 2 h est cree pour le rendez-vous actif'
);
select is(
  (select count(*) from public.notifications
   where user_id = 'a0000000-0000-0000-0000-000000000007'
     and type = 'booking_reminder'
     and payload ->> 'booking_id' = tests.v('b2')),
  2::bigint,
  'les deux rappels sont envoyes au client concerne'
);
select is(
  (select count(*) from public.notification_email_jobs j
   join public.notifications n on n.id = j.notification_id
   where n.user_id = 'a0000000-0000-0000-0000-000000000007'
     and n.type = 'booking_reminder'
     and n.payload ->> 'booking_id' = tests.v('b2')),
  2::bigint,
  'chaque rappel est ajoute a la file e-mail existante'
);
select tests.as_user('a0000000-0000-0000-0000-000000000006');
select throws_ok(
  format(
    $$select public.issue_booking_cancel_token(%L, '24_hours')$$,
    tests.v('b2')
  ),
  '42501', null, 'un client ne peut pas emettre un lien d''annulation'
);
select throws_ok(
  format(
    $$select public.redeem_booking_cancel_token(%L, '24_hours', now() + interval '1 day')$$,
    tests.v('b2')
  ),
  '42501', null, 'un client ne peut pas annuler avec la RPC interne'
);
select tests.as_service();
select ok(
  (select public.issue_booking_cancel_token(tests.v('b2')::uuid, '24_hours') is not null),
  'un lien est emis tant que le delai d''annulation est ouvert'
);
select tests.as_postgres();
update public.shop_settings
set booking_cancel_before_hours = 720
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_service();
select throws_like(
  format(
    $$select public.redeem_booking_cancel_token(%L, '24_hours', %L::timestamptz)$$,
    tests.v('b2'),
    (select lower(during)::text from public.bookings where id = tests.v('b2')::uuid)
  ),
  '%cancellation_too_late%',
  'le lien respecte le delai d''annulation configure par le commercant'
);
select tests.as_postgres();
update public.shop_settings
set booking_cancel_before_hours = 24
where shop_id = '50000000-0000-0000-0000-000000000001';
select tests.as_service();
select lives_ok(
  format(
    $$select public.redeem_booking_cancel_token(%L, '24_hours', %L::timestamptz)$$,
    tests.v('b2'),
    (select lower(during)::text from public.bookings where id = tests.v('b2')::uuid)
  ),
  'le jeton confirme l''annulation avant le delai limite'
);
select throws_like(
  format(
    $$select public.redeem_booking_cancel_token(%L, '24_hours', %L::timestamptz)$$,
    tests.v('b2'),
    (select lower(during)::text from public.bookings where id = tests.v('b2')::uuid)
  ),
  '%booking_cancel_link_used%', 'le lien ne peut etre utilise qu''une seule fois'
);
select tests.as_postgres();
select is(
  (select status::text from public.bookings where id = tests.v('b2')::uuid),
  'cancelled',
  'l''annulation par lien est enregistree'
);
select is(
  public.process_booking_reminders(
    (select lower(during) - interval '1 hour'
     from public.bookings where id = tests.v('b2')::uuid)
  ),
  0,
  'aucun rappel ulterieur n''est cree apres annulation'
);
select ok(
  exists (
    select 1 from public.audit_log
    where entity = 'bookings'
      and entity_id = tests.v('b2')::uuid
      and action = 'booking.cancelled_by_email_link'
  ),
  'l''annulation par lien est journalisee'
);
select tests.as_user('a0000000-0000-0000-0000-000000000005');
select is(
  (select count(*) from public.bookings
   where shop_id = '50000000-0000-0000-0000-000000000001'),
  0::bigint,
  'un employe sans permission rendez-vous ne voit aucun rendez-vous'
);

select tests.as_postgres();
select * from finish();
rollback;
