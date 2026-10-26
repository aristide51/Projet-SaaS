create function public.save_onboarding_payment_methods(
  p_shop uuid,
  p_methods jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_method jsonb;
  v_type text;
  v_phone text;
  v_template text;
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_methods is null
    or jsonb_typeof(p_methods) <> 'array'
    or jsonb_array_length(p_methods) < 1
    or jsonb_array_length(p_methods) > 4
  then
    raise exception 'invalid_payment_methods';
  end if;

  if (
    select count(*) <> count(distinct item.value ->> 'type')
    from jsonb_array_elements(p_methods) as item(value)
  ) then
    raise exception 'invalid_payment_methods';
  end if;

  for v_method in select value from jsonb_array_elements(p_methods)
  loop
    if jsonb_typeof(v_method) <> 'object'
      or not (v_method ? 'type')
    then
      raise exception 'invalid_payment_methods';
    end if;

    v_type := v_method ->> 'type';
    v_phone := v_method ->> 'phone';
    v_template := v_method ->> 'ussdTemplate';

    if v_type in ('ussd_orange', 'ussd_moov') then
      if jsonb_object_length(v_method) <> 3
        or v_phone is null
        or v_phone !~ '^(\+226)?[0-9]{8}$'
        or v_template is null
        or char_length(btrim(v_template)) not between 1 and 80
      then
        raise exception 'invalid_payment_methods';
      end if;
    elsif v_type in ('cash_on_delivery', 'pay_at_pickup') then
      if jsonb_object_length(v_method) <> 1
        or v_phone is not null
        or v_template is not null
      then
        raise exception 'invalid_payment_methods';
      end if;
    else
      raise exception 'invalid_payment_methods';
    end if;
  end loop;

  update public.shop_payment_methods existing
  set active = false
  where existing.shop_id = p_shop
    and existing.type in (
      'ussd_orange'::public.payment_method_type,
      'ussd_moov'::public.payment_method_type,
      'cash_on_delivery'::public.payment_method_type,
      'pay_at_pickup'::public.payment_method_type
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_methods) selected(value)
      where selected.value ->> 'type' = existing.type::text
    );

  for v_method in select value from jsonb_array_elements(p_methods)
  loop
    v_type := v_method ->> 'type';
    v_phone := v_method ->> 'phone';
    v_template := v_method ->> 'ussdTemplate';

    insert into public.shop_payment_methods (
      shop_id,
      type,
      phone_or_code,
      ussd_template,
      active
    )
    values (
      p_shop,
      v_type::public.payment_method_type,
      case
        when v_phone is null then null
        when v_phone like '+226%' then v_phone
        else '+226' || v_phone
      end,
      v_template,
      true
    )
    on conflict (shop_id, type) do update
      set phone_or_code = excluded.phone_or_code,
          ussd_template = excluded.ussd_template,
          active = true;
  end loop;
end $$;

revoke execute on function public.save_onboarding_payment_methods(uuid, jsonb)
  from public, anon;
grant execute on function public.save_onboarding_payment_methods(uuid, jsonb)
  to authenticated;

revoke insert, update, delete on public.shop_payment_methods from authenticated;
