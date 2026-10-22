-- =====================================================================
-- 0002 : fonctions utilitaires, declencheurs, machine a etats, RPC metier
-- Les ecritures sensibles (statuts, paiements, prix, remises) passent
-- UNIQUEMENT par ces fonctions SECURITY DEFINER, jamais par un UPDATE direct.
-- =====================================================================

-- ---------- Aides pour les politiques RLS ----------
create or replace function private.jwt_role() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'none')
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role_global = 'admin')
$$;

create or replace function private.is_shop_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = (select auth.uid()))
$$;

create or replace function private.is_shop_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;

-- Le proprietaire a toutes les permissions ; un employe seulement celles qui lui sont accordees.
create or replace function private.has_shop_permission(p_shop uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
      and (m.role = 'owner' or coalesce((m.permissions ->> p_perm)::boolean, false))
  )
$$;

create or replace function private.is_shop_public(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shops s where s.id = p_shop and s.review_status = 'approved' and not s.is_suspended)
$$;

create or replace function private.current_plan(p_shop uuid) returns public.plans
language sql stable security definer set search_path = '' as $$
  select p.* from public.plans p
  where p.id = coalesce(
    (select s.plan_id from public.subscriptions s where s.shop_id = p_shop and s.status <> 'expired'),
    (select id from public.plans where code = 'free')
  )
$$;

create or replace function private.plan_limits(p_shop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select (private.current_plan(p_shop)).limits
$$;

create or replace function private.plan_feature(p_shop uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(((private.current_plan(p_shop)).features ->> p_key)::boolean, false)
$$;

create or replace function private.write_audit(p_shop uuid, p_action text, p_entity text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, shop_id, action, entity, entity_id, metadata)
  values ((select auth.uid()), p_shop, p_action, p_entity, p_entity_id, p_metadata)
$$;

-- ---------- Declencheurs generiques ----------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','shops','shop_settings','shop_onboarding','shop_payment_accounts',
                           'products','services','bookings','orders','payments','subscriptions']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$I for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- Cree le profil a l'inscription.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'full_name', 120), ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- A la creation d'une boutique : proprietaire, reglages, onboarding, plan gratuit, ressource par defaut.
create or replace function private.after_shop_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shop_members (shop_id, user_id, role) values (new.id, new.created_by, 'owner');
  insert into public.shop_settings (shop_id) values (new.id);
  insert into public.shop_onboarding (shop_id) values (new.id);
  insert into public.subscriptions (shop_id, plan_id) select new.id, p.id from public.plans p where p.code = 'free';
  insert into public.resources (shop_id, name) values (new.id, 'Principal');
  return new;
end $$;
create trigger shops_after_insert after insert on public.shops
  for each row execute function private.after_shop_insert();

-- L'adresse (slug) d'une boutique approuvee ne change plus : les liens partages doivent rester valides.
create or replace function private.guard_shop_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.review_status = 'approved' and new.slug is distinct from old.slug
     and private.jwt_role() <> 'service_role' and not private.is_admin() then
    raise exception 'slug_locked';
  end if;
  return new;
end $$;
create trigger shops_guard_update before update on public.shops
  for each row execute function private.guard_shop_update();

-- ---------- Catalogue ----------
create or replace function private.set_product_search() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.search_vector := to_tsvector('french', extensions.unaccent(
    coalesce(new.name, '') || ' ' || coalesce(new.description, '') || ' ' ||
    coalesce(new.sku, '') || ' ' || coalesce(new.compatibility, '')));
  return new;
end $$;
create trigger products_search before insert or update of name, description, sku, compatibility on public.products
  for each row execute function private.set_product_search();

create or replace function private.enforce_product_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_count integer;
begin
  if new.is_sample then return new; end if;
  v_max := (private.plan_limits(new.shop_id) ->> 'max_products')::integer;
  if v_max is not null then
    select count(*) into v_count from public.products
      where shop_id = new.shop_id and deleted_at is null and not is_sample;
    if v_count >= v_max then raise exception 'plan_limit_products'; end if;
  end if;
  return new;
end $$;
create trigger products_plan_limit before insert on public.products
  for each row execute function private.enforce_product_limit();

create or replace function private.enforce_coupon_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.plan_feature(new.shop_id, 'promotions') then raise exception 'plan_feature_promotions'; end if;
  return new;
end $$;
create trigger coupons_plan_feature before insert on public.coupons
  for each row execute function private.enforce_coupon_feature();

-- ---------- Avis ----------
-- Un avis n'est possible que pour une commande ou un rendez-vous termine du client.
create or replace function private.validate_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.order_id is not null and not exists (
      select 1 from public.orders o
      where o.id = new.order_id and o.shop_id = new.shop_id and o.customer_id = new.customer_id and o.status = 'completed') then
    raise exception 'review_not_allowed';
  end if;
  if new.booking_id is not null and not exists (
      select 1 from public.bookings b
      where b.id = new.booking_id and b.shop_id = new.shop_id and b.customer_id = new.customer_id and b.status = 'completed') then
    raise exception 'review_not_allowed';
  end if;
  select nullif(btrim(p.full_name), '') into v_name from public.profiles p where p.id = new.customer_id;
  new.author_name := case
    when v_name is null then 'Client'
    when position(' ' in v_name) = 0 then v_name
    else split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.'
  end;
  return new;
end $$;
create trigger reviews_validate before insert on public.reviews
  for each row execute function private.validate_review();

create or replace function private.refresh_shop_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_shop uuid := coalesce(new.shop_id, old.shop_id);
begin
  update public.shops s set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.shop_id = v_shop and r.status = 'published'), 0),
    rating_count = (select count(*) from public.reviews r where r.shop_id = v_shop and r.status = 'published')
  where s.id = v_shop;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function private.refresh_shop_rating();

-- ---------- Machine a etats des commandes ----------
-- Source unique de verite des transitions autorisees (voir cahier des charges 4.15).
create or replace function private.order_transition_allowed(p_from public.order_status, p_to public.order_status, p_actor public.actor_type)
returns boolean language sql immutable set search_path = '' as $$
  select (p_from::text, p_to::text, p_actor::text) in (
    ('pending_payment', 'payment_declared', 'customer'),
    ('pending_payment', 'paid',      'merchant'), ('pending_payment', 'paid',      'admin'), ('pending_payment', 'paid',      'system'),
    ('pending_payment', 'cancelled', 'customer'), ('pending_payment', 'cancelled', 'merchant'),
    ('pending_payment', 'cancelled', 'admin'),    ('pending_payment', 'cancelled', 'system'),
    ('payment_declared', 'paid',            'merchant'), ('payment_declared', 'paid',            'admin'),
    ('payment_declared', 'pending_payment', 'merchant'), ('payment_declared', 'pending_payment', 'admin'),
    ('payment_declared', 'cancelled',       'merchant'), ('payment_declared', 'cancelled',       'admin'),
    ('paid',      'confirmed', 'merchant'), ('paid',      'confirmed', 'admin'),
    ('paid',      'refunded',  'merchant'), ('paid',      'refunded',  'admin'),
    ('confirmed', 'ready',     'merchant'), ('confirmed', 'ready',     'admin'),
    ('confirmed', 'refunded',  'merchant'), ('confirmed', 'refunded',  'admin'),
    ('ready',     'completed', 'merchant'), ('ready',     'completed', 'admin'),
    ('ready',     'refunded',  'merchant'), ('ready',     'refunded',  'admin')
  )
$$;

-- Remet en stock les articles d'une commande annulee (stock suivi uniquement).
create or replace function private.restock_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.product_variants v set stock = v.stock + q.qty
  from (select variant_id, sum(quantity)::integer as qty from public.order_items
        where order_id = p_order and variant_id is not null group by variant_id) q
  where v.id = q.variant_id and v.stock is not null;

  update public.products p set stock = p.stock + q.qty
  from (select product_id, sum(quantity)::integer as qty from public.order_items
        where order_id = p_order and variant_id is null and product_id is not null group by product_id) q
  where p.id = q.product_id and p.stock is not null;
end $$;

create or replace function private.apply_order_transition(
  p_order_id uuid, p_to public.order_status, p_actor public.actor_type,
  p_actor_id uuid, p_note text, p_reference text
) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.shop_settings;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  if not private.order_transition_allowed(o.status, p_to, p_actor) then
    raise exception 'transition_not_allowed: % -> % by %', o.status, p_to, p_actor;
  end if;

  select * into s from public.shop_settings where shop_id = o.shop_id;

  if p_to = 'paid' and p_actor in ('merchant', 'admin') and o.payment_method = 'aggregator' then
    raise exception 'aggregator_payment_requires_webhook';
  end if;
  if p_to = 'cancelled' and p_actor in ('merchant', 'admin') and coalesce(btrim(p_note), '') = '' then
    raise exception 'reason_required';
  end if;
  if o.status = 'payment_declared' and p_to = 'pending_payment' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    if o.reject_count >= 1 then raise exception 'reject_limit_reached'; end if;
  end if;
  if p_to = 'refunded' and o.payment_method::text like 'ussd%' and coalesce(btrim(p_reference), '') = '' then
    raise exception 'refund_reference_required';
  end if;

  update public.orders set
    status           = p_to,
    paid_at          = case when p_to = 'paid'      then now() else paid_at end,
    completed_at     = case when p_to = 'completed' then now() else completed_at end,
    cancelled_at     = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancelled_reason = case when p_to = 'cancelled' then coalesce(p_note, 'cancelled') else cancelled_reason end,
    refunded_at      = case when p_to = 'refunded'  then now() else refunded_at end,
    refund_reference = case when p_to = 'refunded'  then p_reference else refund_reference end,
    reject_count     = case when o.status = 'payment_declared' and p_to = 'pending_payment' then reject_count + 1 else reject_count end,
    expires_at       = case
                         when p_to = 'payment_declared'      then null
                         when p_to = 'pending_payment'       then now() + make_interval(hours => s.order_expiry_manual_hours)
                         when p_to in ('paid', 'cancelled')  then null
                         else expires_at end
  where id = o.id;

  if o.status = 'payment_declared' and p_to in ('paid', 'pending_payment', 'cancelled') then
    update public.payment_declarations d set
      status        = (case when p_to = 'paid' then 'confirmed' else 'rejected' end)::public.declaration_status,
      reviewed_by   = p_actor_id,
      reviewed_at   = now(),
      reject_reason = case when p_to = 'paid' then null else p_note end
    where d.order_id = o.id and d.status = 'declared';
  end if;

  if p_to = 'cancelled' or (p_to = 'refunded' and o.status in ('paid', 'confirmed')) then
    perform private.restock_order(o.id);
  end if;

  insert into public.order_status_history (shop_id, order_id, from_status, to_status, actor_type, actor_id, note, reference)
  values (o.shop_id, o.id, o.status, p_to, p_actor, p_actor_id, p_note, p_reference);

  if p_actor in ('merchant', 'admin') and p_to in ('paid', 'refunded', 'cancelled') then
    perform private.write_audit(o.shop_id, 'order.' || p_to::text, 'orders', o.id,
      jsonb_build_object('reference', p_reference, 'note', p_note, 'actor', p_actor));
  end if;

  if p_actor <> 'customer' then
    insert into public.notifications (user_id, type, payload)
    values (o.customer_id, 'order_status', jsonb_build_object('order_id', o.id, 'code', o.code, 'status', p_to));
  end if;
end $$;

-- Transition declenchee par un commercant, un admin, le systeme ou le client (annulation seulement).
create or replace function public.transition_order(
  p_order_id uuid, p_to public.order_status, p_note text default null, p_reference text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_actor public.actor_type; v_uid uuid := (select auth.uid());
begin
  if p_to = 'payment_declared' then raise exception 'use_declare_payment'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;

  if private.jwt_role() = 'service_role' then v_actor := 'system';
  elsif private.is_admin() then v_actor := 'admin';
  elsif private.has_shop_permission(o.shop_id, 'orders') then v_actor := 'merchant';
  elsif v_uid is not null and o.customer_id = v_uid then v_actor := 'customer';
  else raise exception 'forbidden' using errcode = '42501';
  end if;

  perform private.apply_order_transition(o.id, p_to, v_actor, v_uid, p_note, p_reference);
end $$;

-- Le client declare son paiement USSD : reference de transaction + numero payeur.
create or replace function public.declare_payment(
  p_order_id uuid, p_payer_phone text, p_transaction_ref text, p_screenshot_path text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_uid uuid := (select auth.uid()); v_ref text := upper(btrim(p_transaction_ref)); v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if o.customer_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if o.status <> 'pending_payment' then raise exception 'order_not_payable'; end if;
  if o.payment_method::text not like 'ussd%' then raise exception 'not_a_ussd_order'; end if;
  if o.expires_at is not null and o.expires_at < now() then raise exception 'order_expired'; end if;
  if p_screenshot_path is not null and p_screenshot_path not like (o.shop_id::text || '/' || o.id::text || '/%') then
    raise exception 'invalid_screenshot_path';
  end if;

  begin
    insert into public.payment_declarations (shop_id, order_id, payer_phone, transaction_ref, screenshot_path)
    values (o.shop_id, o.id, p_payer_phone, v_ref, p_screenshot_path) returning id into v_id;
  exception when unique_violation then
    raise exception 'reference_already_used';
  end;

  perform private.apply_order_transition(o.id, 'payment_declared', 'customer', v_uid, null, v_ref);
  return v_id;
end $$;

-- Annule les commandes en attente dont le delai est depasse (a planifier avec pg_cron toutes les 5 minutes).
create or replace function public.expire_pending_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.orders
           where status = 'pending_payment' and expires_at is not null and expires_at < now()
           order by expires_at for update skip locked
  loop
    perform private.apply_order_transition(r.id, 'cancelled', 'system', null, 'expired', null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Cree une commande a partir du panier : prix, stock, remise et delais calcules cote serveur.
create or replace function public.create_order_from_cart(
  p_cart_id uuid, p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type default 'pickup',
  p_delivery_address text default null, p_note text default null, p_coupon_code text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart public.carts; v_settings public.shop_settings; v_profile public.profiles;
  v_item record; v_product public.products; v_variant public.product_variants;
  v_coupon public.coupons; v_order_id uuid := gen_random_uuid();
  v_price integer; v_subtotal integer := 0; v_discount integer := 0; v_total integer;
  v_expires timestamptz; v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_cart from public.carts where id = p_cart_id and customer_id = v_uid;
  if not found then raise exception 'cart_not_found' using errcode = 'P0002'; end if;
  if not private.is_shop_public(v_cart.shop_id) then raise exception 'shop_not_available'; end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.phone is null then raise exception 'phone_required'; end if;
  select * into v_settings from public.shop_settings where shop_id = v_cart.shop_id;

  if p_fulfillment = 'delivery' and not v_settings.delivery_enabled then raise exception 'delivery_disabled'; end if;
  if p_fulfillment = 'pickup' and not v_settings.pickup_enabled then raise exception 'pickup_disabled'; end if;
  if p_fulfillment = 'delivery' and coalesce(btrim(p_delivery_address), '') = '' then raise exception 'delivery_address_required'; end if;
  if not exists (select 1 from public.shop_payment_methods m
                 where m.shop_id = v_cart.shop_id and m.type = p_payment_method and m.active) then
    raise exception 'payment_method_not_available';
  end if;
  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then raise exception 'cart_empty'; end if;

  insert into public.orders (id, shop_id, customer_id, payment_method, fulfillment, delivery_address, note,
                             customer_name, customer_phone, subtotal, discount, total)
  values (v_order_id, v_cart.shop_id, v_uid, p_payment_method, p_fulfillment, p_delivery_address, p_note,
          v_profile.full_name, v_profile.phone, 0, 0, 0);

  for v_item in select * from public.cart_items where cart_id = p_cart_id order by id loop
    v_variant := null;
    select * into v_product from public.products
      where id = v_item.product_id and shop_id = v_cart.shop_id for update;
    if not found or v_product.deleted_at is not null or v_product.status <> 'available' then
      raise exception 'product_unavailable: %', v_item.product_id;
    end if;
    v_price := v_product.price;

    if v_item.variant_id is not null then
      select * into v_variant from public.product_variants
        where id = v_item.variant_id and shop_id = v_cart.shop_id and product_id = v_product.id for update;
      if not found then raise exception 'variant_unavailable: %', v_item.variant_id; end if;
      v_price := coalesce(v_variant.price, v_product.price);
      if v_variant.stock is not null then
        if v_variant.stock < v_item.quantity then raise exception 'insufficient_stock: %', v_item.product_id; end if;
        update public.product_variants set stock = stock - v_item.quantity where id = v_variant.id;
      end if;
    elsif v_product.stock is not null then
      if v_product.stock < v_item.quantity then raise exception 'insufficient_stock: %', v_item.product_id; end if;
      update public.products set stock = stock - v_item.quantity where id = v_product.id;
    end if;

    insert into public.order_items (shop_id, order_id, product_id, variant_id, name_snapshot, unit_price, quantity)
    values (v_cart.shop_id, v_order_id, v_product.id, v_item.variant_id,
            v_product.name || coalesce(' - ' || v_variant.name, ''), v_price, v_item.quantity);
    v_subtotal := v_subtotal + v_price * v_item.quantity;
  end loop;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon from public.coupons
      where shop_id = v_cart.shop_id and code = upper(btrim(p_coupon_code)) and active for update;
    if not found
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.ends_at   is not null and v_coupon.ends_at   < now()) then
      raise exception 'coupon_invalid';
    end if;
    if v_subtotal < v_coupon.min_amount then raise exception 'coupon_min_amount'; end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then raise exception 'coupon_exhausted'; end if;
    select count(*) into v_count from public.coupon_redemptions where coupon_id = v_coupon.id and customer_id = v_uid;
    if v_count >= v_coupon.per_customer_limit then raise exception 'coupon_already_used'; end if;
    v_discount := least(v_subtotal, case v_coupon.type when 'percent' then (v_subtotal * v_coupon.value) / 100 else v_coupon.value end);
    insert into public.coupon_redemptions (shop_id, coupon_id, customer_id, order_id)
      values (v_cart.shop_id, v_coupon.id, v_uid, v_order_id);
    update public.coupons set used_count = used_count + 1 where id = v_coupon.id;
  end if;

  v_total := v_subtotal - v_discount;
  if p_payment_method::text like 'ussd%' and v_settings.manual_payment_max_amount is not null
     and v_total > v_settings.manual_payment_max_amount then
    raise exception 'amount_exceeds_manual_limit';
  end if;

  v_expires := case
    when p_payment_method::text like 'ussd%'  then now() + make_interval(hours => v_settings.order_expiry_manual_hours)
    when p_payment_method = 'aggregator'      then now() + make_interval(mins  => v_settings.order_expiry_online_minutes)
    else null end;

  update public.orders set subtotal = v_subtotal, discount = v_discount, total = v_total,
         coupon_id = v_coupon.id, expires_at = v_expires
   where id = v_order_id;

  insert into public.order_status_history (shop_id, order_id, from_status, to_status, actor_type, actor_id)
  values (v_cart.shop_id, v_order_id, null, 'pending_payment', 'customer', v_uid);

  delete from public.cart_items where cart_id = p_cart_id;
  return v_order_id;
end $$;

-- ---------- Rendez-vous ----------
create or replace function public.book_slot(
  p_service_id uuid, p_resource_id uuid, p_start timestamptz, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_service public.services; v_settings public.shop_settings;
  v_end timestamptz; v_local timestamp; v_local_end timestamp; v_id uuid; v_status public.booking_status;
  v_profile public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.phone is null then raise exception 'phone_required'; end if;
  select * into v_service from public.services where id = p_service_id and active and deleted_at is null;
  if not found then raise exception 'service_not_found' using errcode = 'P0002'; end if;
  if not private.is_shop_public(v_service.shop_id) then raise exception 'shop_not_available'; end if;
  if not private.plan_feature(v_service.shop_id, 'bookings') then raise exception 'plan_feature_bookings'; end if;
  if not exists (select 1 from public.resources r where r.id = p_resource_id and r.shop_id = v_service.shop_id and r.active) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  select * into v_settings from public.shop_settings where shop_id = v_service.shop_id;
  if p_start < now() + make_interval(hours => v_settings.booking_min_notice_hours) then raise exception 'too_soon'; end if;
  if p_start > now() + interval '90 days' then raise exception 'too_far'; end if;

  v_end := p_start + make_interval(mins => v_service.duration_min);
  v_local     := p_start at time zone 'Africa/Ouagadougou';
  v_local_end := v_end   at time zone 'Africa/Ouagadougou';
  if v_local::date <> v_local_end::date
     or not exists (select 1 from public.availability_rules a
                    where a.resource_id = p_resource_id and a.shop_id = v_service.shop_id
                      and a.weekday = extract(dow from v_local)::integer
                      and a.start_time <= v_local::time and a.end_time >= v_local_end::time) then
    raise exception 'outside_opening_hours';
  end if;
  if exists (select 1 from public.time_off t
             where t.shop_id = v_service.shop_id and (t.resource_id is null or t.resource_id = p_resource_id)
               and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_start, v_end, '[)')) then
    raise exception 'time_off';
  end if;

  v_status := case when v_settings.booking_auto_confirm then 'confirmed' else 'pending' end;
  begin
    insert into public.bookings (shop_id, service_id, resource_id, customer_id, during, status, customer_note, customer_name, customer_phone)
    values (v_service.shop_id, v_service.id, p_resource_id, v_uid, tstzrange(p_start, v_end, '[)'), v_status, p_note,
            v_profile.full_name, v_profile.phone)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  return v_id;
end $$;

create or replace function public.set_booking_status(p_booking_id uuid, p_to public.booking_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings; s public.shop_settings; v_uid uuid := (select auth.uid()); v_actor public.actor_type;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into s from public.shop_settings where shop_id = b.shop_id;

  if private.is_admin() then v_actor := 'admin';
  elsif private.has_shop_permission(b.shop_id, 'bookings') then v_actor := 'merchant';
  elsif v_uid is not null and b.customer_id = v_uid then v_actor := 'customer';
  else raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_actor = 'customer' then
    if p_to <> 'cancelled' or b.status not in ('pending', 'confirmed') then raise exception 'transition_not_allowed'; end if;
    if now() > lower(b.during) - make_interval(hours => s.booking_cancel_before_hours) then raise exception 'cancellation_too_late'; end if;
  else
    if not ((b.status = 'pending' and p_to in ('confirmed', 'cancelled'))
         or (b.status = 'confirmed' and p_to in ('cancelled', 'completed', 'no_show'))) then
      raise exception 'transition_not_allowed';
    end if;
    if p_to = 'cancelled' and coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
    if p_to = 'completed' and now() < lower(b.during) then raise exception 'booking_not_started'; end if;
    if p_to = 'no_show'   and now() < upper(b.during) then raise exception 'booking_not_finished'; end if;
  end if;

  update public.bookings set status = p_to,
         cancelled_reason = case when p_to = 'cancelled' then coalesce(p_reason, 'cancelled by customer') else cancelled_reason end
   where id = b.id;
end $$;

-- ---------- Validation des boutiques (24 h) ----------
create or replace function public.submit_shop_for_review(p_shop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.shops; v_catalog integer;
begin
  if not private.is_shop_owner(p_shop) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.shops where id = p_shop for update;
  if s.review_status not in ('draft', 'rejected') then raise exception 'invalid_review_state'; end if;
  if s.whatsapp is null then raise exception 'missing_whatsapp'; end if;
  select (select count(*) from public.products where shop_id = p_shop and deleted_at is null and not is_sample)
       + (select count(*) from public.services where shop_id = p_shop and deleted_at is null and not is_sample)
    into v_catalog;
  if v_catalog < 1 then raise exception 'missing_catalog'; end if;
  if not exists (select 1 from public.shop_payment_methods where shop_id = p_shop and active) then
    raise exception 'missing_payment_method';
  end if;
  update public.shops set review_status = 'submitted', submitted_at = now(), rejection_reason = null where id = p_shop;
  perform private.write_audit(p_shop, 'shop.submitted', 'shops', p_shop);
end $$;

create or replace function public.review_shop(p_shop uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.shops;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from public.shops where id = p_shop for update;
  if not found then raise exception 'shop_not_found' using errcode = 'P0002'; end if;
  if s.review_status <> 'submitted' then raise exception 'invalid_review_state'; end if;
  if not p_approve and coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update public.shops set
    review_status    = case when p_approve then 'approved' else 'rejected' end::public.shop_review_status,
    reviewed_at      = now(),
    reviewed_by      = (select auth.uid()),
    rejection_reason = case when p_approve then null else p_reason end
  where id = p_shop;
  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'shop_review', jsonb_build_object('shop_id', p_shop, 'approved', p_approve, 'reason', p_reason)
  from public.shop_members m where m.shop_id = p_shop and m.role = 'owner';
  perform private.write_audit(p_shop, case when p_approve then 'shop.approved' else 'shop.rejected' end, 'shops', p_shop,
                              jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.set_shop_suspended(p_shop uuid, p_suspended boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.shops set is_suspended = p_suspended where id = p_shop;
  if not found then raise exception 'shop_not_found' using errcode = 'P0002'; end if;
  perform private.write_audit(p_shop, case when p_suspended then 'shop.suspended' else 'shop.unsuspended' end, 'shops', p_shop,
                              jsonb_build_object('reason', p_reason));
end $$;

-- ---------- Avis : reponse du commercant et moderation ----------
create or replace function public.reply_to_review(p_review_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reviews;
begin
  select * into r from public.reviews where id = p_review_id;
  if not found then raise exception 'review_not_found' using errcode = 'P0002'; end if;
  if not private.has_shop_permission(r.shop_id, 'reviews') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.reviews set shop_reply = left(btrim(p_reply), 1000), shop_replied_at = now() where id = p_review_id;
end $$;

create or replace function public.moderate_review(p_review_id uuid, p_status public.review_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.reviews set status = p_status where id = p_review_id;
  if not found then raise exception 'review_not_found' using errcode = 'P0002'; end if;
end $$;
