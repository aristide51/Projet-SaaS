drop function public.save_coupon(
  uuid, uuid, text, public.coupon_type, integer, integer, timestamptz,
  timestamptz, integer, integer, jsonb, boolean
);

create function public.save_coupon(
  p_shop_id uuid,
  p_code text,
  p_type public.coupon_type,
  p_value integer,
  p_min_amount integer,
  p_per_customer_limit integer,
  p_scope jsonb,
  p_active boolean,
  p_coupon_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_max_uses integer default null
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

revoke all on function public.save_coupon(
  uuid, text, public.coupon_type, integer, integer, integer, jsonb,
  boolean, uuid, timestamptz, timestamptz, integer
) from public, anon;
grant execute on function public.save_coupon(
  uuid, text, public.coupon_type, integer, integer, integer, jsonb,
  boolean, uuid, timestamptz, timestamptz, integer
) to authenticated;
