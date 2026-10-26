create or replace function public.preview_order(
  p_cart_id uuid,
  p_payment_method public.payment_method_type,
  p_fulfillment public.fulfillment_type,
  p_coupon_code text
)
returns table (
  subtotal integer,
  discount integer,
  total integer,
  errors text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart public.carts;
  v_settings public.shop_settings;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_cart
  from public.carts
  where id = p_cart_id and carts.customer_id = v_uid;
  if not found then
    raise exception 'cart_not_found' using errcode = 'P0002';
  end if;

  select * into v_settings
  from public.shop_settings
  where shop_settings.shop_id = v_cart.shop_id;

  if p_fulfillment = 'delivery' and not v_settings.delivery_enabled then
    raise exception 'delivery_disabled';
  end if;
  if p_fulfillment = 'pickup' and not v_settings.pickup_enabled then
    raise exception 'pickup_disabled';
  end if;

  return query
    select c.subtotal, c.discount, c.total, array[]::text[]
    from private.calculate_cart_totals(
      p_cart_id, p_payment_method, null::public.fulfillment_type,
      null, p_coupon_code, false
    ) c;
exception
  when sqlstate 'P0001' or sqlstate 'P0002' then
    return query
      select null::integer, null::integer, null::integer, array[sqlerrm]::text[];
end;
$$;

revoke execute on function public.preview_order(
  uuid, public.payment_method_type, public.fulfillment_type, text
) from public, anon;
grant execute on function public.preview_order(
  uuid, public.payment_method_type, public.fulfillment_type, text
) to authenticated;
