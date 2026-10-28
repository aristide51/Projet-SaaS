-- =====================================================================
-- 0029 : creneaux disponibles pour les rendez-vous
-- get_available_slots(p_service_id, p_resource_id, p_date)
-- SECURITY DEFINER, accessible aux visiteurs connectes (authenticated)
-- Retourne uniquement les creneaux libres, sans exposer les reservations
-- des autres clients.
-- =====================================================================

create or replace function public.get_available_slots(
  p_service_id uuid,
  p_resource_id uuid,
  p_date date
) returns table(slot_start timestamptz, slot_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_service  public.services;
  v_settings public.shop_settings;
  v_weekday  smallint;
  v_now      timestamptz := now();
  v_min_start timestamptz;
  v_day_start timestamptz;
begin
  -- Validation du service : existe, actif, non supprime, boutique approuvee
  select * into v_service
  from public.services
  where id = p_service_id and active and deleted_at is null;
  if not found then
    raise exception 'service_not_found' using errcode = 'P0002';
  end if;

  if not private.is_shop_public(v_service.shop_id) then
    raise exception 'shop_not_available';
  end if;

  -- Validation de la ressource : existe, active, appartient a la boutique
  if not exists (
    select 1 from public.resources r
    where r.id = p_resource_id
      and r.shop_id = v_service.shop_id
      and r.active
  ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  -- La date demandee est interpretee comme une date locale au Burkina (Africa/Ouagadougou = UTC+0)
  v_weekday := extract(dow from p_date)::smallint; -- 0 = dimanche

  select * into v_settings
  from public.shop_settings
  where shop_id = v_service.shop_id;

  -- Premier depart possible : maintenant + preavis minimal
  v_min_start := v_now + make_interval(hours => v_settings.booking_min_notice_hours);

  -- Debut de la journee demandee, en heure locale du Burkina (= UTC)
  v_day_start := (p_date at time zone 'Africa/Ouagadougou');

  return query
  with opening as (
    -- Plusieurs plages horaires par jour sont possibles (pauses, midi, etc.)
    select a.start_time, a.end_time
    from public.availability_rules a
    where a.resource_id = p_resource_id
      and a.shop_id = v_service.shop_id
      and a.weekday = v_weekday
  ),
  slots as (
    -- Genere un creneau par bloc de duration_min dans chaque plage d'ouverture
    select
      (v_day_start +
       (extract(hour from o.start_time) * interval '1 hour') +
       (extract(minute from o.start_time) * interval '1 minute')) +
       (generate_series * (v_service.duration_min || ' minutes')::interval) as slot_start
    from opening o,
    lateral generate_series(
      0,
      greatest(
        0,
        floor(extract(epoch from (o.end_time - o.start_time)) / 60 / v_service.duration_min)::int - 1
      )
    ) as gs
  )
  select s.slot_start,
         s.slot_start + (v_service.duration_min || ' minutes')::interval as slot_end
  from slots s
  where s.slot_start >= greatest(v_min_start, v_day_start)
    -- Pas de fermeture exceptionnelle (time_off) qui chevauche
    and not exists (
      select 1 from public.time_off t
      where t.shop_id = v_service.shop_id
        and (t.resource_id is null or t.resource_id = p_resource_id)
        and tstzrange(t.starts_at, t.ends_at, '[)') &&
            tstzrange(s.slot_start, s.slot_start + (v_service.duration_min || ' minutes')::interval, '[)')
    )
    -- Pas de reservation active (pending/confirmed) qui chevauche (exclusion constraint)
    and not exists (
      select 1 from public.bookings b
      where b.resource_id = p_resource_id
        and b.status in ('pending', 'confirmed')
        and b.during &&
            tstzrange(s.slot_start, s.slot_start + (v_service.duration_min || ' minutes')::interval, '[)')
    )
  order by s.slot_start;
end $$;

grant execute on function public.get_available_slots(uuid, uuid, date) to authenticated;