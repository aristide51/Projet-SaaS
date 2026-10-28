insert into auth.users (id, email, raw_user_meta_data)
values (
  'a0000000-0000-0000-0000-000000000001',
  'lighthouse@example.invalid',
  '{"full_name":"Lighthouse CI"}'
);

insert into public.shops (
  id,
  created_by,
  slug,
  name,
  description,
  category,
  city,
  district,
  review_status,
  is_suspended
)
values (
  '50000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'lhci-boutique',
  'Boutique Lighthouse',
  'Boutique de test des budgets de performance.',
  'hardware',
  'Ouagadougou',
  'Dassasgho',
  'approved',
  false
);

insert into public.products (
  id,
  shop_id,
  name,
  description,
  price,
  status
)
values (
  'b0000000-0000-4000-8000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'Produit Lighthouse',
  'Produit fictif pour les contrôles de performance.',
  5000,
  'available'
);
