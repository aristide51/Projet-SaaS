create or replace function private.can_manage_booking_resources(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_shop_permission(p_shop, 'bookings')
    and private.plan_feature(p_shop, 'bookings')
$$;

revoke all on function private.can_manage_booking_resources(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_manage_booking_resources(uuid)
  to authenticated;

drop trigger resources_require_bookings_plan on public.resources;
create trigger resources_require_bookings_plan
  before update on public.resources
  for each row execute function private.enforce_bookings_feature();

drop policy resources_write on public.resources;
create policy resources_write on public.resources for all to authenticated
  using (private.can_manage_booking_resources(shop_id))
  with check (private.can_manage_booking_resources(shop_id));
