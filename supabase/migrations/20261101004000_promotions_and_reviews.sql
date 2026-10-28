create or replace function private.valid_coupon_scope(p_scope jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_scope) = 'object'
    and (p_scope - 'product_ids' - 'category_ids') = '{}'::jsonb
    and (
      not (p_scope ? 'product_ids')
      or (
        jsonb_typeof(p_scope -> 'product_ids') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements(p_scope -> 'product_ids') item
          where jsonb_typeof(item) <> 'string'
             or item #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    )
    and (
      not (p_scope ? 'category_ids')
      or (
        jsonb_typeof(p_scope -> 'category_ids') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements(p_scope -> 'category_ids') item
          where jsonb_typeof(item) <> 'string'
             or item #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    );
$$;

create or replace function private.coupon_scope_matches(
  p_scope jsonb,
  p_product_id uuid,
  p_category_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (
      coalesce(jsonb_array_length(p_scope -> 'product_ids'), 0) = 0
      and coalesce(jsonb_array_length(p_scope -> 'category_ids'), 0) = 0
    )
    or (p_scope -> 'product_ids') @> jsonb_build_array(p_product_id::text)
    or (
      p_category_id is not null
      and (p_scope -> 'category_ids') @> jsonb_build_array(p_category_id::text)
    );
$$;

alter table public.coupons
  add constraint coupons_scope_valid check (private.valid_coupon_scope(scope));

create or replace function private.validate_coupon_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  if not private.valid_coupon_scope(new.scope) then
    raise exception 'coupon_scope_invalid';
  end if;

  for v_id in
    select jsonb_array_elements_text(new.scope -> 'product_ids')
  loop
    if not exists (
      select 1 from public.products p
      where p.id = v_id::uuid and p.shop_id = new.shop_id
        and p.deleted_at is null
    ) then
      raise exception 'coupon_scope_product_invalid';
    end if;
  end loop;
  for v_id in
    select jsonb_array_elements_text(new.scope -> 'category_ids')
  loop
    if not exists (
      select 1 from public.categories c
      where c.id = v_id::uuid and c.shop_id = new.shop_id
    ) then
      raise exception 'coupon_scope_category_invalid';
    end if;
  end loop;
  return new;
end;
$$;
create trigger coupons_scope_validate
  before insert or update of scope, shop_id on public.coupons
  for each row execute function private.validate_coupon_scope();

create or replace function public.save_coupon(
  p_shop_id uuid,
  p_coupon_id uuid,
  p_code text,
  p_type public.coupon_type,
  p_value integer,
  p_min_amount integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_uses integer,
  p_per_customer_limit integer,
  p_scope jsonb,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_shop_permission(p_shop_id, 'promotions') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.plan_feature(p_shop_id, 'promotions') then
    raise exception 'plan_feature_promotions';
  end if;
  if p_code !~ '^[A-Za-z0-9_-]{3,24}$'
     or p_value <= 0
     or p_min_amount < 0
     or (p_type = 'percent' and p_value > 100)
     or (p_max_uses is not null and p_max_uses <= 0)
     or p_per_customer_limit <= 0
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at)
     or not private.valid_coupon_scope(p_scope) then
    raise exception 'coupon_invalid' using errcode = '22023';
  end if;

  if p_coupon_id is null then
    insert into public.coupons (
      shop_id, code, type, value, min_amount, starts_at, ends_at,
      max_uses, per_customer_limit, scope, active
    ) values (
      p_shop_id, upper(p_code), p_type, p_value, p_min_amount, p_starts_at, p_ends_at,
      p_max_uses, p_per_customer_limit, p_scope, p_active
    )
    returning id into v_id;
  else
    update public.coupons
    set code = upper(p_code),
        type = p_type,
        value = p_value,
        min_amount = p_min_amount,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        max_uses = p_max_uses,
        per_customer_limit = p_per_customer_limit,
        scope = p_scope,
        active = p_active
    where id = p_coupon_id and shop_id = p_shop_id
    returning id into v_id;
    if v_id is null then
      raise exception 'coupon_not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

revoke all on function private.valid_coupon_scope(jsonb)
  from public, anon, authenticated;
revoke all on function private.coupon_scope_matches(jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.validate_coupon_scope()
  from public, anon, authenticated;
revoke all on function public.save_coupon(
  uuid, uuid, text, public.coupon_type, integer, integer, timestamptz,
  timestamptz, integer, integer, jsonb, boolean
) from public, anon;
grant execute on function public.save_coupon(
  uuid, uuid, text, public.coupon_type, integer, integer, timestamptz,
  timestamptz, integer, integer, jsonb, boolean
) to authenticated;

create or replace function private.calculate_cart_totals(
  p_cart_id uuid,
  p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type,
  p_delivery_address text,
  p_coupon_code text,
  p_lock_rows boolean
)
returns table (
  shop_id uuid,
  customer_id uuid,
  subtotal integer,
  discount integer,
  total integer,
  coupon_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart public.carts;
  v_settings public.shop_settings;
  v_profile public.profiles;
  v_item record;
  v_product public.products;
  v_variant public.product_variants;
  v_coupon public.coupons;
  v_price integer;
  v_line_total integer;
  v_subtotal integer := 0;
  v_coupon_subtotal integer := 0;
  v_discount integer := 0;
  v_count integer;
  v_coupon_lines jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_cart from public.carts
  where id = p_cart_id and carts.customer_id = v_uid;
  if not found then raise exception 'cart_not_found' using errcode = 'P0002'; end if;
  if not private.is_shop_public(v_cart.shop_id) then raise exception 'shop_not_available'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.phone is null then raise exception 'phone_required'; end if;
  select * into v_settings from public.shop_settings where shop_id = v_cart.shop_id;
  if p_fulfillment = 'delivery' and not v_settings.delivery_enabled then raise exception 'delivery_disabled'; end if;
  if p_fulfillment = 'pickup' and not v_settings.pickup_enabled then raise exception 'pickup_disabled'; end if;
  if p_fulfillment = 'delivery' and coalesce(btrim(p_delivery_address), '') = '' then raise exception 'delivery_address_required'; end if;
  if not exists (
    select 1 from public.shop_payment_methods m
    where m.shop_id = v_cart.shop_id and m.type = p_payment_method and m.active
  ) then raise exception 'payment_method_not_available'; end if;
  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then raise exception 'cart_empty'; end if;

  for v_item in
    select * from public.cart_items where cart_id = p_cart_id order by id
  loop
    v_variant := null;
    if p_lock_rows then
      select * into v_product from public.products
      where id = v_item.product_id and products.shop_id = v_cart.shop_id for update;
    else
      select * into v_product from public.products
      where id = v_item.product_id and products.shop_id = v_cart.shop_id;
    end if;
    if not found or v_product.deleted_at is not null or v_product.status <> 'available' then
      raise exception 'product_unavailable: %', v_item.product_id;
    end if;
    v_price := v_product.price;

    if v_item.variant_id is not null then
      if p_lock_rows then
        select * into v_variant from public.product_variants
        where id = v_item.variant_id and product_variants.shop_id = v_cart.shop_id
          and product_id = v_product.id for update;
      else
        select * into v_variant from public.product_variants
        where id = v_item.variant_id and product_variants.shop_id = v_cart.shop_id
          and product_id = v_product.id;
      end if;
      if not found then raise exception 'variant_unavailable: %', v_item.variant_id; end if;
      v_price := coalesce(v_variant.price, v_product.price);
      if v_variant.stock is not null and v_variant.stock < v_item.quantity then
        raise exception 'insufficient_stock: %', v_item.product_id;
      end if;
    elsif v_product.stock is not null and v_product.stock < v_item.quantity then
      raise exception 'insufficient_stock: %', v_item.product_id;
    end if;

    v_line_total := v_price * v_item.quantity;
    v_subtotal := v_subtotal + v_line_total;
    v_coupon_lines := v_coupon_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'category_id', v_product.category_id,
      'line_total', v_line_total
    ));
  end loop;

  v_coupon := null;
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    if p_lock_rows then
      select * into v_coupon from public.coupons
      where coupons.shop_id = v_cart.shop_id
        and code = upper(btrim(p_coupon_code)) and active for update;
    else
      select * into v_coupon from public.coupons
      where coupons.shop_id = v_cart.shop_id
        and code = upper(btrim(p_coupon_code)) and active;
    end if;
    if not found
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at is not null and v_coupon.ends_at < now()) then
      raise exception 'coupon_invalid';
    end if;
    if v_subtotal < v_coupon.min_amount then raise exception 'coupon_min_amount'; end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then raise exception 'coupon_exhausted'; end if;
    select count(*) into v_count from public.coupon_redemptions
    where coupon_id = v_coupon.id and coupon_redemptions.customer_id = v_uid;
    if v_count >= v_coupon.per_customer_limit then raise exception 'coupon_already_used'; end if;

    select coalesce(sum((line ->> 'line_total')::integer), 0)::integer
    into v_coupon_subtotal
    from jsonb_array_elements(v_coupon_lines) line
    where private.coupon_scope_matches(
      v_coupon.scope,
      (line ->> 'product_id')::uuid,
      nullif(line ->> 'category_id', '')::uuid
    );
    if v_coupon_subtotal = 0 then raise exception 'coupon_no_eligible_items'; end if;
    v_discount := least(
      v_coupon_subtotal,
      case v_coupon.type
        when 'percent' then (v_coupon_subtotal * v_coupon.value) / 100
        else v_coupon.value
      end
    );
  end if;

  if p_payment_method::text like 'ussd%'
     and v_settings.manual_payment_max_amount is not null
     and v_subtotal - v_discount > v_settings.manual_payment_max_amount then
    raise exception 'amount_exceeds_manual_limit';
  end if;

  return query select v_cart.shop_id, v_uid, v_subtotal, v_discount,
    v_subtotal - v_discount, v_coupon.id;
end;
$$;

revoke all on function private.calculate_cart_totals(
  uuid, public.payment_method_type, public.fulfillment_type, text, text, boolean
) from public, anon, authenticated, service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'review-photos', 'review-photos', true, 3145728,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy review_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'review-photos');
create policy review_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] ~* '^[0-9a-f-]{36}$'
    and exists (
      select 1 from public.reviews r
      where r.id = ((storage.foldername(name))[3])::uuid
        and r.shop_id = ((storage.foldername(name))[1])::uuid
        and r.customer_id = (select auth.uid())
    )
  );
create policy review_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create or replace function private.validate_review_photos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if cardinality(new.photo_paths) > 3 then
    raise exception 'review_photo_limit';
  end if;
  foreach v_path in array new.photo_paths loop
    if v_path !~ (
      '^' || new.shop_id::text || '/' || new.customer_id::text || '/'
      || new.id::text || '/[0-9a-f-]{36}[.]webp$'
    ) or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'review-photos' and o.name = v_path
    ) then
      raise exception 'review_photo_invalid';
    end if;
  end loop;
  return new;
end;
$$;
create trigger reviews_photos_validate
  before insert or update of photo_paths on public.reviews
  for each row execute function private.validate_review_photos();

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (review_id, reporter_id)
);
alter table public.review_reports enable row level security;
revoke all on public.review_reports from public, anon, authenticated;
grant select on public.review_reports to authenticated;
create policy review_reports_read on public.review_reports for select to authenticated
  using (private.is_admin());

create or replace function public.report_review(p_review_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
  v_customer_id uuid := auth.uid();
begin
  if v_customer_id is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'review_report_reason_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.status = 'published'
      and r.customer_id <> v_customer_id
      and private.is_shop_public(r.shop_id)
  ) then
    raise exception 'review_not_reportable';
  end if;
  insert into public.review_reports (review_id, reporter_id, reason)
  values (p_review_id, v_customer_id, btrim(p_reason))
  returning id into v_report_id;

  insert into public.notifications (user_id, type, payload)
  select p.id, 'review_report',
    jsonb_build_object('review_id', p_review_id, 'report_id', v_report_id)
  from public.profiles p where p.role_global = 'admin';
  return v_report_id;
exception
  when unique_violation then raise exception 'review_already_reported';
end;
$$;

create or replace function public.resolve_review_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review_id uuid;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_review_report_status';
  end if;
  update public.review_reports
  set status = p_status, resolved_at = now()
  where id = p_report_id and status = 'open'
  returning review_id into v_review_id;
  if v_review_id is null then raise exception 'review_report_not_found'; end if;
  if p_status = 'resolved' then
    update public.reviews set status = 'flagged' where id = v_review_id;
  end if;
end;
$$;

create or replace function private.notify_review_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    insert into public.notifications (user_id, type, payload)
    values (
      new.customer_id,
      'review_invitation',
      jsonb_build_object(
        'shop_id', new.shop_id,
        'order_id', new.id,
        'source', 'order'
      )
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger order_review_invitation
  after update of status on public.orders
  for each row execute function private.notify_review_invitation();

create or replace function private.notify_booking_review_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status = 'completed' then
    insert into public.notifications (user_id, type, payload)
    values (
      new.customer_id,
      'review_invitation',
      jsonb_build_object(
        'shop_id', new.shop_id,
        'booking_id', new.id,
        'source', 'booking'
      )
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger booking_review_invitation
  after update of status on public.bookings
  for each row execute function private.notify_booking_review_invitation();

create or replace function public.storefront_reviews(
  p_shop_id uuid,
  p_product_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  photo_paths text[],
  author_name text,
  shop_reply text,
  shop_replied_at timestamptz,
  created_at timestamptz,
  review_count bigint,
  rating_average numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.photo_paths,
    r.author_name,
    r.shop_reply,
    r.shop_replied_at,
    r.created_at,
    count(*) over (),
    round(avg(r.rating) over (), 2)
  from public.reviews r
  where r.shop_id = p_shop_id
    and r.status = 'published'
    and private.is_shop_public(p_shop_id)
    and (
      p_product_id is null
      or exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id and o.shop_id = r.shop_id
        where oi.order_id = r.order_id and oi.product_id = p_product_id
      )
    )
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 30);
$$;

revoke all on function private.notify_review_invitation()
  from public, anon, authenticated;
revoke all on function private.notify_booking_review_invitation()
  from public, anon, authenticated;
revoke all on function private.validate_review_photos()
  from public, anon, authenticated;
revoke all on function public.report_review(uuid, text) from public, anon;
revoke all on function public.resolve_review_report(uuid, text) from public, anon, authenticated;
revoke all on function public.storefront_reviews(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.report_review(uuid, text) to authenticated;
grant execute on function public.resolve_review_report(uuid, text) to authenticated;
grant execute on function public.storefront_reviews(uuid, uuid, integer)
  to anon, authenticated;
