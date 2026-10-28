drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using (
    (private.is_shop_public(shop_id) and status <> 'hidden'
      and deleted_at is null and not is_sample and not hidden_by_plan)
    or private.is_shop_member(shop_id)
    or private.is_admin()
  );
