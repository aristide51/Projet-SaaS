create or replace function public.accept_shop_invitation(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invitation public.shop_invitations;
  v_email text;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_shop_id uuid;
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

  select shop_id into v_shop_id
  from public.shop_invitations
  where token_hash = p_token_hash;
  if not found then
    raise exception 'invitation_invalid_or_used';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_shop_id::text, 1)
  );

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

create function public.list_shop_invitations(p_shop uuid)
returns table (
  id uuid,
  email text,
  permissions jsonb,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  is_expired boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_owner(p_shop) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select i.id, i.email, i.permissions, i.status, i.created_at, i.expires_at,
    i.status = 'pending' and i.expires_at <= now()
  from public.shop_invitations i
  where i.shop_id = p_shop
  order by i.created_at desc;
end $$;

revoke execute on function public.list_shop_invitations(uuid) from public, anon;
grant execute on function public.list_shop_invitations(uuid) to authenticated;
