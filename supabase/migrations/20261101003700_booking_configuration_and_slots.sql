create or replace function public.get_available_slots(
  p_service_id uuid,
  p_resource_id uuid,
  p_date date
)
returns table(slot_start timestamptz, slot_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.services;
  v_settings public.shop_settings;
  v_min_start timestamptz;
  v_day_start timestamptz;
begin
  if p_date is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and active
    and deleted_at is null;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;
  if not private.is_shop_public(v_service.shop_id) then
    raise exception 'shop_not_available';
  end if;
  if not private.plan_feature(v_service.shop_id, 'bookings') then
    raise exception 'plan_feature_bookings';
  end if;
  if not exists (
    select 1
    from public.resources resource
    where resource.id = p_resource_id
      and resource.shop_id = v_service.shop_id
      and resource.active
  ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if p_date < (now() at time zone 'Africa/Ouagadougou')::date
     or p_date > (now() at time zone 'Africa/Ouagadougou')::date + 90
  then
    return;
  end if;

  select * into v_settings
  from public.shop_settings
  where shop_settings.shop_id = v_service.shop_id;
  if not found then
    raise exception 'shop_settings_not_found' using errcode = 'P0002';
  end if;

  v_min_start := now() + make_interval(
    hours => v_settings.booking_min_notice_hours
  );
  v_day_start := p_date::timestamp at time zone 'Africa/Ouagadougou';

  return query
  with opening as (
    select
      (p_date + availability.start_time)
        at time zone 'Africa/Ouagadougou' as range_start,
      (p_date + availability.end_time)
        at time zone 'Africa/Ouagadougou' as range_end
    from public.availability_rules availability
    where availability.resource_id = p_resource_id
      and availability.shop_id = v_service.shop_id
      and availability.weekday =
        extract(dow from p_date)::smallint
  ),
  slots as (
    select
      opening.range_start
        + make_interval(mins => slot_index * v_service.duration_min)
        as slot_start
    from opening
    cross join lateral generate_series(
      0,
      floor(
        extract(epoch from (opening.range_end - opening.range_start))
          / 60 / v_service.duration_min
      )::integer - 1
    ) as generated(slot_index)
  )
  select distinct
    slots.slot_start,
    slots.slot_start + make_interval(mins => v_service.duration_min)
  from slots
  where slots.slot_start >= greatest(v_min_start, v_day_start)
    and not exists (
      select 1
      from public.time_off time_off
      where time_off.shop_id = v_service.shop_id
        and (time_off.resource_id is null or time_off.resource_id = p_resource_id)
        and tstzrange(time_off.starts_at, time_off.ends_at, '[)')
          && tstzrange(
            slots.slot_start,
            slots.slot_start + make_interval(mins => v_service.duration_min),
            '[)'
          )
    )
    and not exists (
      select 1
      from public.bookings booking
      where booking.resource_id = p_resource_id
        and booking.status in ('pending', 'confirmed')
        and booking.during
          && tstzrange(
            slots.slot_start,
            slots.slot_start + make_interval(mins => v_service.duration_min),
            '[)'
          )
    )
  order by slots.slot_start;
end;
$$;

revoke all on function public.get_available_slots(uuid, uuid, date)
  from public, anon;
grant execute on function public.get_available_slots(uuid, uuid, date)
  to authenticated;

create or replace function public.save_availability_rules(
  p_shop uuid,
  p_rules jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved integer;
begin
  if (select auth.uid()) is null
     or not private.has_shop_permission(p_shop, 'bookings')
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1
  from public.shops
  where id = p_shop
  for update;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;
  if not private.plan_feature(p_shop, 'bookings') then
    raise exception 'plan_feature_bookings';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'invalid_availability_rules' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rules) > 200 then
    raise exception 'invalid_availability_rules' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rules) as item(value)
    where jsonb_typeof(item.value) <> 'object'
       or item.value - 'resource_id' - 'weekday' - 'start_time' - 'end_time'
          <> '{}'::jsonb
       or jsonb_typeof(item.value -> 'resource_id') <> 'string'
       or jsonb_typeof(item.value -> 'weekday') <> 'number'
       or jsonb_typeof(item.value -> 'start_time') <> 'string'
       or jsonb_typeof(item.value -> 'end_time') <> 'string'
       or (item.value ->> 'resource_id') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (item.value ->> 'weekday') !~ '^[0-6]$'
       or (item.value ->> 'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (item.value ->> 'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) then
    raise exception 'invalid_availability_rules' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rules) as rule(
      resource_id uuid,
      weekday integer,
      start_time time,
      end_time time
    )
    where rule.start_time >= rule.end_time
  ) then
    raise exception 'invalid_availability_rules' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rules) as first_rule(
      resource_id uuid,
      weekday integer,
      start_time time,
      end_time time
    )
    join jsonb_to_recordset(p_rules) as second_rule(
      resource_id uuid,
      weekday integer,
      start_time time,
      end_time time
    )
      on first_rule.resource_id = second_rule.resource_id
     and first_rule.weekday = second_rule.weekday
     and (first_rule.start_time, first_rule.end_time)
       < (second_rule.start_time, second_rule.end_time)
     and tsrange(
       date '2000-01-03' + first_rule.start_time,
       date '2000-01-03' + first_rule.end_time,
       '[)'
     ) && tsrange(
       date '2000-01-03' + second_rule.start_time,
       date '2000-01-03' + second_rule.end_time,
       '[)'
     )
  ) then
    raise exception 'availability_rules_overlap' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_rules) as rule(
      resource_id uuid,
      weekday integer,
      start_time time,
      end_time time
    )
    where not exists (
      select 1
      from public.resources resource
      where resource.id = rule.resource_id
        and resource.shop_id = p_shop
    )
  ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  delete from public.availability_rules
  where shop_id = p_shop;

  insert into public.availability_rules (
    shop_id,
    resource_id,
    weekday,
    start_time,
    end_time
  )
  select
    p_shop,
    rule.resource_id,
    rule.weekday,
    rule.start_time,
    rule.end_time
  from jsonb_to_recordset(p_rules) as rule(
    resource_id uuid,
    weekday integer,
    start_time time,
    end_time time
  );

  get diagnostics v_saved = row_count;
  return v_saved;
end;
$$;

revoke all on function public.save_availability_rules(uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.save_availability_rules(uuid, jsonb)
  to authenticated;

create or replace function private.enforce_bookings_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if private.jwt_role() = 'none' then
    return new;
  end if;
  v_shop := new.shop_id;
  if not private.plan_feature(v_shop, 'bookings') then
    raise exception 'plan_feature_bookings';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_bookings_feature()
  from public, anon, authenticated, service_role;

create trigger resources_require_bookings_plan
  before insert or update on public.resources
  for each row execute function private.enforce_bookings_feature();
create trigger availability_rules_require_bookings_plan
  before insert or update on public.availability_rules
  for each row execute function private.enforce_bookings_feature();
create trigger time_off_require_bookings_plan
  before insert or update on public.time_off
  for each row execute function private.enforce_bookings_feature();

create or replace function private.enforce_booking_settings_feature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.jwt_role() <> 'none'
     and not private.plan_feature(new.shop_id, 'bookings')
  then
    raise exception 'plan_feature_bookings';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_booking_settings_feature()
  from public, anon, authenticated, service_role;

create trigger shop_booking_settings_require_plan
  before update of booking_auto_confirm,
    booking_min_notice_hours,
    booking_cancel_before_hours on public.shop_settings
  for each row execute function private.enforce_booking_settings_feature();

drop policy shop_settings_update on public.shop_settings;
create policy shop_settings_update on public.shop_settings for update to authenticated
  using (private.has_shop_permission(shop_id, 'settings') or private.has_shop_permission(shop_id, 'bookings'))
  with check (private.has_shop_permission(shop_id, 'settings') or private.has_shop_permission(shop_id, 'bookings'));
