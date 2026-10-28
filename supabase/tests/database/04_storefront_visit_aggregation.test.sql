begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
set time zone 'UTC';
select * from no_plan();

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-0000-0000-000000000011',
  'storefront-visits@test.bf',
  '{"full_name":"Tests visites"}'
);
insert into public.shops (
  id, created_by, slug, name, review_status
)
values (
  '50000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000011',
  'visites-anonymes-test',
  'Boutique visites anonymes',
  'approved'
);
insert into public.products (
  id, shop_id, name, price, status
)
values (
  'b0000000-0000-0000-0000-000000000011',
  '50000000-0000-0000-0000-000000000011',
  'Produit visites',
  1000,
  'available'
);

set local role anon;
select lives_ok(
  $$select public.record_public_storefront_visit('50000000-0000-0000-0000-000000000011')$$,
  'un visiteur anonyme peut enregistrer une visite de boutique'
);
select lives_ok(
  $$select public.record_public_storefront_visit(
    '50000000-0000-0000-0000-000000000011',
    'b0000000-0000-0000-0000-000000000011'
  )$$,
  'un visiteur anonyme peut enregistrer une visite produit'
);
select throws_ok(
  $$select * from public.public_storefront_visit_counts$$,
  '42501',
  null,
  'les compteurs agrégés restent privés'
);
select throws_like(
  $$select public.record_public_storefront_visit(
    '50000000-0000-0000-0000-000000000011',
    'b0000000-0000-0000-0000-000000000012'
  )$$,
  '%product_not_public%',
  'une visite ne peut pas référencer un produit non public'
);
reset role;

select is(
  (select count(*) from public.public_storefront_visit_counts),
  2::bigint,
  'seuls les deux totaux de visites sont conservés sans identité visiteur'
);
select is(
  (select sum(view_count) from public.public_storefront_visit_counts),
  2::numeric,
  'les compteurs enregistrent le total attendu'
);

select * from finish();
rollback;
