create table public.service_images (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  service_id uuid not null,
  path       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (service_id, shop_id) references public.services (id, shop_id) on delete cascade
);

alter table public.service_images enable row level security;
create index service_images_service_idx on public.service_images (service_id);

grant select on public.service_images to anon, authenticated;
grant insert, update, delete on public.service_images to authenticated;

create policy service_images_select on public.service_images for select to anon, authenticated
  using (exists (
    select 1 from public.services s
    where s.id = service_id and s.shop_id = service_images.shop_id
      and (
        (private.is_shop_public(s.shop_id) and s.active and s.deleted_at is null)
        or private.is_shop_member(s.shop_id)
        or private.is_admin()
      )
  ));
create policy service_images_write on public.service_images for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog'))
  with check (private.has_shop_permission(shop_id, 'catalog'));
