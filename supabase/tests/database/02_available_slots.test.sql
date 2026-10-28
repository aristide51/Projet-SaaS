-- =====================================================================
-- Tests pgTAP : get_available_slots (creneaux de rendez-vous)
-- Lancer : supabase test db
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

-- ---------- Donnees de test independantes ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-0000-0000-000000000001', 'proprio@test.bf', '{"full_name":"Proprio Test"}');

insert into public.shops (id, created_by, slug, name, whatsapp, review_status) values
  ('51000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'shop-test', 'Shop Test', '+22670111111', 'approved');
update public.subscriptions
set plan_id = (select id from public.plans where code = 'pro'), status = 'active'
where shop_id = '51000000-0000-0000-0000-000000000001';
update public.shop_settings
set booking_min_notice_hours = 2, booking_auto_confirm = false
where shop_id = '51000000-0000-0000-0000-000000000001';

insert into public.resources (id, shop_id, name, active) values
  ('61000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'Ressource Test', true);

insert into public.services (id, shop_id, name, duration_min, price, active, deleted_at) values
  ('41000000-0000-0000-0000-000000000099', '51000000-0000-0000-0000-000000000001', 'Service Test', 60, 5000, true, null);

insert into public.availability_rules (shop_id, resource_id, weekday, start_time, end_time) values
  ('51000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 2, '08:00', '18:00');

select tests.as_user('a1000000-0000-0000-0000-000000000001');

select is(
  public.save_availability_rules(
    '51000000-0000-0000-0000-000000000001',
    '[{"resource_id":"61000000-0000-0000-0000-000000000001","weekday":2,"start_time":"08:00","end_time":"18:00"}]'::jsonb
  ),
  1,
  'le proprietaire enregistre atomiquement son horaire hebdomadaire'
);
select throws_like(
  $$select public.save_availability_rules(
    '51000000-0000-0000-0000-000000000001',
    '[{"resource_id":"61000000-0000-0000-0000-000000000001","weekday":2,"start_time":"08:00","end_time":"12:00"},{"resource_id":"61000000-0000-0000-0000-000000000001","weekday":2,"start_time":"11:00","end_time":"14:00"}]'::jsonb
  )$$,
  'availability_rules_overlap%',
  'des plages qui se chevauchent sont refusees'
);
select throws_ok(
  $$select public.save_availability_rules(
    '51000000-0000-0000-0000-000000000001',
    '{}'::jsonb
  )$$,
  '22023', null,
  'un document qui n est pas un tableau JSON est rejete proprement'
);
select is(
  (select count(*) from public.availability_rules
   where shop_id = '51000000-0000-0000-0000-000000000001'),
  1::bigint,
  'un horaire invalide ne modifie pas les plages deja enregistrees'
);

-- ---------------------------------------------------------------------
-- 1. Creneaux normaux : une plage 08:00-18:00, service 60min => 10 creneaux
-- ---------------------------------------------------------------------
select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  )),
  10::bigint,
  '10 creneaux disponibles sur une plage 08:00-18:00 (service 60min)'
);

-- Le premier creneau doit respecter le preavis minimal (2h)
select ok(
  not exists (
    select 1 from public.get_available_slots(
      '41000000-0000-0000-0000-000000000099',
      '61000000-0000-0000-0000-000000000001',
      current_date
    )
    where slot_start < now() + make_interval(hours => 2)
  ),
  'aucun creneau avant maintenant + preavis minimal'
);
select ok(
  (select bool_and(
     to_jsonb(slot) - 'slot_start' - 'slot_end' = '{}'::jsonb
     and to_jsonb(slot) ? 'slot_start'
     and to_jsonb(slot) ? 'slot_end'
   )
   from public.get_available_slots(
     '41000000-0000-0000-0000-000000000099',
     '61000000-0000-0000-0000-000000000001',
     (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
   ) slot
   cross join lateral jsonb_object_keys(to_jsonb(slot)) as keys(key)),
  'la recherche de disponibilites ne retourne que les bornes des creneaux'
);

-- ---------------------------------------------------------------------
-- 2. Plusieurs regles le mardi (pauses) : 08:00-12:00 et 14:00-18:00
--    => 4 + 4 = 8 creneaux, rien entre 12:00 et 14:00
-- ---------------------------------------------------------------------
select is(
  public.save_availability_rules(
    '51000000-0000-0000-0000-000000000001',
    '[{"resource_id":"61000000-0000-0000-0000-000000000001","weekday":2,"start_time":"08:00","end_time":"12:00"},{"resource_id":"61000000-0000-0000-0000-000000000001","weekday":2,"start_time":"14:00","end_time":"18:00"}]'::jsonb
  ),
  2,
  'plusieurs plages par jour enregistrent une pause entre les rendez-vous'
);

select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  )),
  8::bigint,
  '8 creneaux avec deux plages (pause midi)'
);

select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  ) where slot_start::time >= '12:00' and slot_start::time < '14:00'),
  0::bigint,
  'aucun creneau pendant la pause de midi'
);

-- ---------------------------------------------------------------------
-- 3. Jour ferie : time_off couvrant toute la journee => 0 creneau
-- ---------------------------------------------------------------------
delete from public.availability_rules where resource_id = '61000000-0000-0000-0000-000000000001';
insert into public.availability_rules (shop_id, resource_id, weekday, start_time, end_time) values
  ('51000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 2, '08:00', '18:00');

insert into public.time_off (shop_id, resource_id, starts_at, ends_at, reason) values
  ('51000000-0000-0000-0000-000000000001', null,
   (date_trunc('week', now() + interval '14 days') + interval '1 day')::timestamptz,
   (date_trunc('week', now() + interval '14 days') + interval '1 day')::timestamptz + interval '23 hours 59 minutes',
   'Jour ferie');

select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  )),
  0::bigint,
  'aucun creneau un jour ferie (time_off journee entiere)'
);

-- ---------------------------------------------------------------------
-- 4. Chevauchement : un booking confirme bloque son creneau
-- ---------------------------------------------------------------------
delete from public.time_off
where shop_id = '51000000-0000-0000-0000-000000000001';

select tests.as_postgres();
do $$
declare
  v_mardi timestamptz := (date_trunc('week', now() + interval '14 days') + interval '1 day' + interval '9 hours')::timestamptz;
begin
  insert into public.bookings (shop_id, service_id, resource_id, customer_id, during, status, customer_name, customer_phone)
  values (
    '51000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    tstzrange(v_mardi, v_mardi + interval '60 minutes', '[)'),
    'confirmed',
    'Client Test',
    '+22670000001'
  );
end $$;
select tests.as_user('a1000000-0000-0000-0000-000000000001');

select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  ) where slot_start = (date_trunc('week', now() + interval '14 days') + interval '1 day' + interval '9 hours')::timestamptz),
  0::bigint,
  'le creneau deja reserve (confirme) n est plus disponible'
);

-- ---------------------------------------------------------------------
-- 5. Creneau passe : date d'hier => 0 creneau (tout est avant now + preavis)
-- ---------------------------------------------------------------------
select is(
  (select count(*) from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    current_date - 1
  )),
  0::bigint,
  'aucun creneau disponible pour une date passee'
);

-- ---------------------------------------------------------------------
-- 6. Ressource inactive => exception resource_not_found
-- ---------------------------------------------------------------------
update public.resources set active = false where id = '61000000-0000-0000-0000-000000000001';

select throws_ok(
  $$select * from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  )$$,
  'P0002', null, 'ressource inactive rejetee'
);

-- ---------------------------------------------------------------------
-- 7. Anonyme ne peut pas appeler (fonction reservee aux connects)
-- ---------------------------------------------------------------------
select tests.as_anon();
select throws_ok(
  $$select * from public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    (date_trunc('week', now() + interval '14 days') + interval '1 day')::date
  )$$,
  '42501', null, 'anon ne peut pas appeler get_available_slots'
);

select tests.as_postgres();
update public.subscriptions
set plan_id = (select id from public.plans where code = 'free')
where shop_id = '51000000-0000-0000-0000-000000000001';
select tests.as_user('a1000000-0000-0000-0000-000000000001');
select throws_like(
  $$select public.get_available_slots(
    '41000000-0000-0000-0000-000000000099',
    '61000000-0000-0000-0000-000000000001',
    current_date + 14
  )$$,
  'plan_feature_bookings%',
  'le plan Gratuit ne permet pas de consulter les creneaux de rendez-vous'
);
select throws_like(
  $$select public.save_availability_rules(
    '51000000-0000-0000-0000-000000000001',
    '[]'::jsonb
  )$$,
  'plan_feature_bookings%',
  'le plan Gratuit ne permet pas de modifier les horaires de rendez-vous'
);
select ok(
  exists (
    select 1 from public.resources
    where shop_id = '51000000-0000-0000-0000-000000000001'
      and name = 'Principal'
  ),
  'la ressource initiale creee avec la boutique reste disponible sur le plan Gratuit'
);
select throws_ok(
  $$insert into public.resources (shop_id, name)
    values ('51000000-0000-0000-0000-000000000001', 'Autre ressource')$$,
  '42501', null,
  'la base bloque la creation directe de ressources sans le plan Pro'
);
select throws_like(
  $$update public.shop_settings
    set booking_min_notice_hours = 3
    where shop_id = '51000000-0000-0000-0000-000000000001'$$,
  'plan_feature_bookings%',
  'la base bloque aussi le changement des reglages sans le plan Pro'
);
select tests.as_postgres();
select * from finish();
rollback;