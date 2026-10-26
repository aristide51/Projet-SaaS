drop policy categories_select on public.categories;
create policy categories_select on public.categories for select to anon, authenticated
  using (
    (
      private.is_shop_public(shop_id)
      and exists (
        select 1 from public.products p
        where p.shop_id = categories.shop_id
          and p.category_id = categories.id
          and p.deleted_at is null
          and p.status <> 'hidden'
          and not p.is_sample
      )
    )
    or private.is_shop_member(shop_id)
    or private.is_admin()
  );
