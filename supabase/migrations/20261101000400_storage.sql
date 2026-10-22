-- =====================================================================
-- 0004 : Storage (buckets, limites, politiques)
-- Convention de chemin : shop-assets/{shop_id}/...   payment-proofs/{shop_id}/{order_id}/...
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-assets',    'shop-assets',    true,  5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('payment-proofs', 'payment-proofs', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Images de boutique : lecture publique, ecriture par les membres autorises du catalogue.
create policy shop_assets_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'shop-assets');
create policy shop_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-assets' and private.has_shop_permission(((storage.foldername(name))[1])::uuid, 'catalog'));
create policy shop_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-assets' and private.has_shop_permission(((storage.foldername(name))[1])::uuid, 'catalog'));
create policy shop_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-assets' and private.has_shop_permission(((storage.foldername(name))[1])::uuid, 'catalog'));

-- Captures de paiement : le client envoie dans le dossier de SA commande, la boutique et l'admin lisent.
create policy payment_proofs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (select 1 from public.orders o
                where o.id = ((storage.foldername(name))[2])::uuid
                  and o.shop_id = ((storage.foldername(name))[1])::uuid
                  and o.customer_id = (select auth.uid()))
  );
create policy payment_proofs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and exists (select 1 from public.orders o
                where o.id = ((storage.foldername(name))[2])::uuid
                  and o.shop_id = ((storage.foldername(name))[1])::uuid
                  and (o.customer_id = (select auth.uid())
                       or private.has_shop_permission(o.shop_id, 'orders') or private.is_admin()))
  );
