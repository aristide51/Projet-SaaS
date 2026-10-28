begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set time zone 'UTC';
select * from no_plan();

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-0000-0000-000000000010',
  'directory-performance@test.bf',
  '{"full_name":"Tests annuaire"}'
);

insert into public.shops (
  created_by, slug, name, category, city, district, lat, lng, opening_hours,
  review_status, is_suspended, rating_avg, rating_count
)
select
  'a0000000-0000-0000-0000-000000000010',
  'annuaire-test-' || lpad(generated.id::text, 5, '0'),
  'Commerce de test ' || generated.id,
  case when generated.id % 2 = 0 then 'hardware'::public.shop_category
    else 'garage'::public.shop_category end,
  case when generated.id % 2 = 0 then 'Ouagadougou' else 'Bobo-Dioulasso' end,
  case when generated.id % 2 = 0 then 'Dassasgho' else 'Accart-ville' end,
  12.3714 + generated.id::double precision / 100000,
  -1.5197 - generated.id::double precision / 100000,
  jsonb_build_object(
    'monday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'tuesday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'wednesday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'thursday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'friday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'saturday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59'),
    'sunday', jsonb_build_object('closed', false, 'opensAt', '00:00', 'closesAt', '23:59')
  ),
  case when generated.id = 9999 then 'draft'::public.shop_review_status
    else 'approved'::public.shop_review_status end,
  generated.id = 9998,
  (generated.id % 50)::numeric / 10,
  generated.id % 37
from generate_series(1, 10000) as generated(id);

update public.subscriptions
set plan_id = (select id from public.plans where code = 'pro')
where shop_id = (
  select id from public.shops where slug = 'annuaire-test-00001'
);

insert into public.coupons (
  shop_id, code, type, value, starts_at, ends_at, active, max_uses, used_count
)
select id, 'TESTPROMO', 'percent', 10, now() - interval '1 day',
  now() + interval '1 day', true, 5, 0
from public.shops
where slug = 'annuaire-test-00001';

analyze public.shops;
analyze public.coupons;

explain (analyze, buffers)
select *
from public.search_shops(
  p_city => 'Ouagadougou',
  p_category => 'hardware',
  p_limit => 12
);

select ok(
  (select count(*) = 12
   from public.search_shops(
     p_city => 'Ouagadougou',
     p_category => 'hardware',
     p_limit => 12
   )),
  'la recherche filtre ville et catégorie sur un annuaire de 10 000 boutiques'
);
select is(
  (select count(*)
   from public.search_shops(
     p_city => 'Ouagadougou',
     p_district => 'Dassasgho',
     p_category => 'hardware',
     p_min_rating => 4,
     p_open_now => true,
     p_limit => 24
   )),
  24::bigint,
  'les filtres quartier, note minimale et ouvert maintenant sont combinables'
);
select ok(
  exists (
    select 1
    from public.search_shops(p_has_promotion => true)
    where slug = 'annuaire-test-00001'
      and has_promotion
  ),
  'les promotions actives sont signalées dans l’annuaire'
);
select is(
  (select slug
   from public.search_shops(
     p_sort => 'distance',
     p_lat => 12.3714,
     p_lng => -1.5197,
     p_limit => 1
   )),
  'annuaire-test-00001',
  'le tri par distance retourne la boutique la plus proche en premier'
);
select ok(
  exists (
    select 1
    from public.search_shops(p_query => 'Commerce de test 42')
    where slug = 'annuaire-test-00042'
  ),
  'la recherche par nom trouve une boutique publiée'
);
select ok(
  not exists (
    select 1
    from public.search_shops()
    where slug in ('annuaire-test-09998', 'annuaire-test-09999')
  ),
  'les boutiques suspendues et non publiées restent exclues'
);
set local role anon;
select ok(
  exists (
    select 1
    from public.search_shops(
      p_query => 'Commerce de test 2',
      p_city => 'Ouagadougou'
    )
    where slug = 'annuaire-test-00002'
  ),
  'les visiteurs peuvent rechercher les boutiques publiques'
);
reset role;
select is(
  (select count(distinct shop_id)
   from (
     with first_page as materialized (
       select *
       from public.search_shops(p_city => 'Ouagadougou', p_sort => 'rating', p_limit => 12)
     ),
     last_item as (
       select sort_value, shop_id
       from first_page
       order by sort_value desc, shop_id desc
       limit 1
     ),
     second_page as (
       select page.*
       from last_item cursor
       cross join lateral public.search_shops(
         p_city => 'Ouagadougou',
         p_sort => 'rating',
         p_cursor_value => cursor.sort_value,
         p_cursor_id => cursor.shop_id,
         p_limit => 12
       ) page
     )
     select shop_id from first_page
     union all
     select shop_id from second_page
   ) pages),
  24::bigint,
  'la pagination par curseur ne répète pas les boutiques'
);

with started as materialized (
  select clock_timestamp() as at
),
results as materialized (
  select *
  from public.search_shops(
    p_city => 'Ouagadougou',
    p_category => 'hardware',
    p_sort => 'rating',
    p_limit => 12
  )
),
measured as (
  select started.at, count(results.shop_id) as result_count
  from started
  cross join results
  group by started.at
)
select ok(
  (select result_count = 12
     and extract(epoch from (clock_timestamp() - at)) * 1000 < 100
   from measured),
  'la recherche indexée sur 10 000 boutiques répond en moins de 100 ms'
);

select * from finish();
rollback;
