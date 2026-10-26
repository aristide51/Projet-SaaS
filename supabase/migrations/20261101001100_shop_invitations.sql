create table public.shop_invitations (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at  timestamptz,
  check (expires_at > created_at),
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);

create unique index shop_invitations_pending_email_idx
  on public.shop_invitations (shop_id, email)
  where status = 'pending';
create index shop_invitations_shop_created_idx
  on public.shop_invitations (shop_id, created_at desc);

alter table public.shop_invitations enable row level security;

grant select (id, shop_id, email, permissions, status, created_by, created_at, expires_at, accepted_at, revoked_at)
  on public.shop_invitations to authenticated;
create policy shop_invitations_owner_select
  on public.shop_invitations for select to authenticated
  using (private.is_shop_owner(shop_id));

revoke insert, update, delete on public.shop_members from authenticated;

create function public.create_shop_invitation(
  p_shop uuid,
  p_email text,
  p_token_hash text,
  p_permissions jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_max_staff integer;
  v_staff_count integer;
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_email is null
    or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_permissions is null
    or jsonb_typeof(p_permissions) <> 'object'
    or p_permissions - array['catalog', 'orders', 'bookings', 'promotions', 'reviews', 'settings', 'payments'] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_each(p_permissions) as permission(key, value)
      where jsonb_typeof(permission.value) <> 'boolean'
    )
  then
    raise exception 'invalid_invitation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop::text, 1)
  );

  update public.shop_invitations
  set status = 'expired'
  where shop_id = p_shop and status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.shop_members m
    join auth.users u on u.id = m.user_id
    where m.shop_id = p_shop and lower(u.email) = lower(btrim(p_email))
  ) then
    raise exception 'already_shop_member';
  end if;

  if exists (
    select 1 from public.shop_invitations i
    where i.shop_id = p_shop and i.email = lower(btrim(p_email)) and i.status = 'pending'
  ) then
    raise exception 'invitation_already_pending';
  end if;

  v_max_staff := (private.plan_limits(p_shop) ->> 'max_staff')::integer;
  select count(*) into v_staff_count
  from public.shop_members m
  where m.shop_id = p_shop and m.role = 'staff';
  v_staff_count := v_staff_count + (
    select count(*) from public.shop_invitations i
    where i.shop_id = p_shop and i.status = 'pending' and i.expires_at > now()
  );
  if v_max_staff is not null and v_staff_count >= v_max_staff then
    raise exception 'plan_limit_staff';
  end if;

  insert into public.shop_invitations (
    shop_id, email, token_hash, permissions, created_by
  ) values (
    p_shop, lower(btrim(p_email)), p_token_hash, p_permissions, auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

create function public.revoke_shop_invitation(
  p_shop uuid,
  p_invitation uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.shop_invitations
  set status = 'revoked', revoked_at = now()
  where id = p_invitation and shop_id = p_shop and status = 'pending';
  if not found then
    raise exception 'invitation_not_found';
  end if;
end $$;

create function public.rotate_shop_invitation_token(
  p_shop uuid,
  p_invitation uuid,
  p_token_hash text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation';
  end if;
  update public.shop_invitations
  set token_hash = p_token_hash
  where id = p_invitation and shop_id = p_shop
    and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'invitation_not_found';
  end if;
end $$;

create function public.accept_shop_invitation(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.shop_invitations;
  v_email text;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_max_staff integer;
  v_staff_count integer;
begin
  if auth.uid() is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invitation';
  end if;

  select email, email_confirmed_at
  into v_user_email, v_email_confirmed_at
  from auth.users
  where id = auth.uid();
  if v_user_email is null or v_email_confirmed_at is null then
    raise exception 'email_not_confirmed';
  end if;

  select * into v_invitation
  from public.shop_invitations
  where token_hash = p_token_hash
  for update;
  if not found or v_invitation.status <> 'pending' then
    raise exception 'invitation_invalid_or_used';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'invitation_expired';
  end if;
  if lower(v_user_email) <> v_invitation.email then
    raise exception 'invitation_email_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_invitation.shop_id::text, 1)
  );

  if exists (
    select 1 from public.shop_members
    where shop_id = v_invitation.shop_id and user_id = auth.uid()
  ) then
    raise exception 'already_shop_member';
  end if;

  v_max_staff := (private.plan_limits(v_invitation.shop_id) ->> 'max_staff')::integer;
  select count(*) into v_staff_count from public.shop_members
  where shop_id = v_invitation.shop_id and role = 'staff';
  if v_max_staff is not null and v_staff_count >= v_max_staff then
    raise exception 'plan_limit_staff';
  end if;

  insert into public.shop_members (shop_id, user_id, role, permissions)
  values (v_invitation.shop_id, auth.uid(), 'staff', v_invitation.permissions);
  update public.shop_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invitation.id;
  return v_invitation.shop_id;
end $$;

create function public.update_shop_member_permissions(
  p_shop uuid,
  p_user uuid,
  p_permissions jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid()
    or p_permissions is null
    or jsonb_typeof(p_permissions) <> 'object'
    or p_permissions - array['catalog', 'orders', 'bookings', 'promotions', 'reviews', 'settings', 'payments'] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_each(p_permissions) as permission(key, value)
      where jsonb_typeof(permission.value) <> 'boolean'
    )
  then
    raise exception 'invalid_permissions';
  end if;

  update public.shop_members
  set permissions = p_permissions
  where shop_id = p_shop and user_id = p_user and role = 'staff';
  if not found then
    raise exception 'staff_member_not_found';
  end if;
end $$;

create function public.list_shop_team(p_shop uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role public.shop_role,
  permissions jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, p.full_name, m.role, m.permissions
  from public.shop_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.shop_id = p_shop
  order by m.role, lower(u.email);
end $$;

create function public.shop_staff_limit(p_shop uuid)
returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return (private.plan_limits(p_shop) ->> 'max_staff')::integer;
end $$;

create function public.remove_shop_staff(
  p_shop uuid,
  p_user uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.shop_members
  where shop_id = p_shop and user_id = p_user and role = 'staff';
  if not found then
    raise exception 'staff_member_not_found';
  end if;
end $$;

revoke execute on function public.create_shop_invitation(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.revoke_shop_invitation(uuid, uuid) from public, anon;
revoke execute on function public.rotate_shop_invitation_token(uuid, uuid, text) from public, anon;
revoke execute on function public.accept_shop_invitation(text) from public, anon;
revoke execute on function public.update_shop_member_permissions(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.list_shop_team(uuid) from public, anon;
revoke execute on function public.shop_staff_limit(uuid) from public, anon;
revoke execute on function public.remove_shop_staff(uuid, uuid) from public, anon;
grant execute on function public.create_shop_invitation(uuid, text, text, jsonb) to authenticated;
grant execute on function public.revoke_shop_invitation(uuid, uuid) to authenticated;
grant execute on function public.rotate_shop_invitation_token(uuid, uuid, text) to authenticated;
grant execute on function public.accept_shop_invitation(text) to authenticated;
grant execute on function public.update_shop_member_permissions(uuid, uuid, jsonb) to authenticated;
grant execute on function public.list_shop_team(uuid) to authenticated;
grant execute on function public.shop_staff_limit(uuid) to authenticated;
grant execute on function public.remove_shop_staff(uuid, uuid) to authenticated;
