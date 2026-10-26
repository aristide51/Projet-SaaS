create type public.order_cancellation_request_status as enum (
  'pending',
  'refunded',
  'cancelled',
  'rejected'
);

create table public.order_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  order_id uuid not null,
  customer_id uuid not null references auth.users(id) on delete cascade,
  status public.order_cancellation_request_status not null default 'pending',
  customer_note text check (char_length(customer_note) <= 500),
  resolution_note text check (char_length(resolution_note) <= 500),
  refund_reference text check (refund_reference is null or char_length(refund_reference) <= 40),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  foreign key (order_id, shop_id)
    references public.orders(id, shop_id) on delete cascade
);

create unique index order_cancellation_requests_pending_unique
  on public.order_cancellation_requests (order_id)
  where status = 'pending';
create index order_cancellation_requests_shop_idx
  on public.order_cancellation_requests (shop_id, requested_at desc);

alter table public.order_cancellation_requests enable row level security;
grant select on public.order_cancellation_requests to authenticated;
create policy order_cancellation_requests_select
  on public.order_cancellation_requests for select to authenticated
  using (
    customer_id = (select auth.uid())
    or private.has_shop_permission(shop_id, 'orders')
    or private.is_admin()
  );

create or replace function public.request_order_cancellation(
  p_order_id uuid,
  p_customer_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_uid uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_customer_note is not null and char_length(p_customer_note) > 500 then
    raise exception 'invalid_cancellation_note' using errcode = '22023';
  end if;

  select * into o
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.customer_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if o.status not in ('payment_declared', 'paid', 'confirmed', 'ready') then
    raise exception 'order_cancellation_request_not_allowed';
  end if;

  begin
    insert into public.order_cancellation_requests (
      shop_id, order_id, customer_id, customer_note
    )
    values (o.shop_id, o.id, v_uid, nullif(btrim(p_customer_note), ''))
    returning id into v_request_id;
  exception when unique_violation then
    raise exception 'cancellation_request_already_pending';
  end;

  insert into public.notifications (user_id, type, payload)
  select m.user_id, 'order_cancellation_request',
    jsonb_build_object(
      'request_id', v_request_id,
      'order_id', o.id,
      'code', o.code,
      'resolution', 'requested'
    )
  from public.shop_members m
  where m.shop_id = o.shop_id
    and (
      m.role = 'owner'
      or m.permissions @> '{"orders": true}'::jsonb
    );

  return v_request_id;
end $$;

create or replace function public.resolve_order_cancellation_request(
  p_request_id uuid,
  p_resolution text,
  p_note text default null,
  p_refund_reference text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.order_cancellation_requests;
  o public.orders;
  v_uid uuid := (select auth.uid());
  v_actor public.actor_type;
  v_request_status public.order_cancellation_request_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_resolution is null
     or p_resolution not in ('refunded', 'cancelled', 'rejected') then
    raise exception 'invalid_cancellation_resolution' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'invalid_cancellation_note' using errcode = '22023';
  end if;
  if p_resolution in ('cancelled', 'rejected')
     and coalesce(btrim(p_note), '') = '' then
    raise exception 'reason_required';
  end if;

  select * into r
  from public.order_cancellation_requests
  where id = p_request_id;
  if not found then
    raise exception 'cancellation_request_not_found' using errcode = 'P0002';
  end if;
  if private.is_admin() then
    v_actor := 'admin';
  elsif private.has_shop_permission(r.shop_id, 'orders') then
    v_actor := 'merchant';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'cancellation_request_already_resolved';
  end if;

  select * into o
  from public.orders
  where id = r.order_id and shop_id = r.shop_id
  for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select * into r
  from public.order_cancellation_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'cancellation_request_not_found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'cancellation_request_already_resolved';
  end if;

  if p_resolution = 'refunded' then
    if o.status = 'payment_declared' then
      if o.payment_method = 'aggregator' then
        raise exception 'aggregator_payment_requires_webhook';
      end if;
      perform private.apply_order_transition(
        o.id, 'paid', v_actor, v_uid,
        coalesce(nullif(btrim(p_note), ''), 'Refund requested by customer'),
        null
      );
    elsif o.status not in ('paid', 'confirmed', 'ready') then
      raise exception 'cancellation_refund_not_allowed';
    end if;

    perform private.apply_order_transition(
      o.id, 'refunded', v_actor, v_uid,
      coalesce(nullif(btrim(p_note), ''), 'Refund completed'),
      p_refund_reference
    );
    v_request_status := 'refunded';
  elsif p_resolution = 'cancelled' then
    if o.status <> 'payment_declared' then
      raise exception 'cancellation_without_refund_not_allowed';
    end if;
    perform private.apply_order_transition(
      o.id, 'cancelled', v_actor, v_uid, p_note, null
    );
    v_request_status := 'cancelled';
  else
    v_request_status := 'rejected';
  end if;

  update public.order_cancellation_requests
  set status = v_request_status,
      resolution_note = nullif(btrim(p_note), ''),
      refund_reference = case
        when v_request_status = 'refunded' then nullif(btrim(p_refund_reference), '')
        else null
      end,
      resolved_at = now(),
      resolved_by = v_uid
  where id = r.id;

  insert into public.notifications (user_id, type, payload)
  values (
    r.customer_id,
    'order_cancellation_request',
    jsonb_build_object(
      'request_id', r.id,
      'order_id', o.id,
      'code', o.code,
      'resolution', v_request_status
    )
  );
end $$;

revoke all on function public.request_order_cancellation(uuid, text) from public;
revoke all on function public.resolve_order_cancellation_request(uuid, text, text, text) from public;
grant execute on function public.request_order_cancellation(uuid, text) to authenticated;
grant execute on function public.resolve_order_cancellation_request(uuid, text, text, text) to authenticated;
