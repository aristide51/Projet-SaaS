create index if not exists shops_directory_city_category_idx
  on public.shops (lower(city), lower(coalesce(district, '')), category, rating_avg desc, id)
  where review_status = 'approved' and not is_suspended;

create index if not exists shops_directory_name_trgm_idx
  on public.shops using gin (name extensions.gin_trgm_ops)
  where review_status = 'approved' and not is_suspended;

create index if not exists coupons_directory_active_idx
  on public.coupons (shop_id, starts_at, ends_at)
  where active;

create or replace function public.search_shops(
  p_query text default null,
  p_city text default null,
  p_district text default null,
  p_category public.shop_category default null,
  p_open_now boolean default false,
  p_min_rating numeric default null,
  p_has_promotion boolean default false,
  p_sort text default 'relevance',
  p_lat double precision default null,
  p_lng double precision default null,
  p_cursor_value numeric default null,
  p_cursor_id uuid default null,
  p_limit integer default 12
)
returns table (
  shop_id uuid,
  slug text,
  name text,
  description text,
  category public.shop_category,
  logo_path text,
  city text,
  district text,
  rating_avg numeric,
  rating_count integer,
  is_open_now boolean,
  has_promotion boolean,
  distance_km numeric,
  sort_value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := left(nullif(btrim(coalesce(p_query, '')), ''), 100);
begin
  if p_sort not in ('relevance', 'distance', 'rating') then
    raise exception 'invalid_directory_sort';
  end if;
  if p_min_rating is not null and p_min_rating not between 0 and 5 then
    raise exception 'invalid_directory_rating';
  end if;
  if (p_cursor_value is null) <> (p_cursor_id is null) then
    raise exception 'invalid_directory_cursor';
  end if;
  if p_sort = 'distance' and (
    p_lat is null or p_lng is null
    or p_lat not between -90 and 90
    or p_lng not between -180 and 180
  ) then
    raise exception 'invalid_directory_coordinates';
  end if;

  return query
  with current_local_time as (
    select
      (now() at time zone 'Africa/Ouagadougou')::date as local_date,
      (now() at time zone 'Africa/Ouagadougou')::time as local_time
  ),
  weekday_name as (
    select case extract(isodow from local_date)::integer
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      when 6 then 'saturday'
      else 'sunday'
    end as name, local_time
    from current_local_time
  ),
  candidates as (
    select
      s.id,
      s.slug,
      s.name,
      s.description,
      s.category,
      s.logo_path,
      s.city,
      s.district,
      s.rating_avg,
      s.rating_count,
      (
        s.opening_hours -> w.name ->> 'closed' = 'false'
        and case
          when (s.opening_hours -> w.name ->> 'opensAt') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            and (s.opening_hours -> w.name ->> 'closesAt') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          then w.local_time >= (s.opening_hours -> w.name ->> 'opensAt')::time
            and w.local_time < (s.opening_hours -> w.name ->> 'closesAt')::time
          else false
        end
      ) as open_now,
      exists (
        select 1
        from public.coupons c
        where c.shop_id = s.id
          and c.active
          and (c.starts_at is null or c.starts_at <= now())
          and (c.ends_at is null or c.ends_at > now())
          and (c.max_uses is null or c.used_count < c.max_uses)
      ) as promotion_active,
      case
        when p_lat is null or p_lng is null or s.lat is null or s.lng is null then null
        else 6371 * 2 * asin(sqrt(least(1::double precision,
          power(sin(radians(s.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(s.lat))
          * power(sin(radians(s.lng - p_lng) / 2), 2)
        )))::numeric
      end as distance_value,
      case
        when v_query is null then 0
        when lower(s.name) = lower(v_query) then 0
        when s.name ilike replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
          then 1
        else 2
      end::numeric as relevance_value
    from public.shops s
    cross join weekday_name w
    where s.review_status = 'approved'
      and not s.is_suspended
      and (p_city is null or lower(s.city) = lower(btrim(p_city)))
      and (p_district is null or lower(coalesce(s.district, '')) = lower(btrim(p_district)))
      and (p_category is null or s.category = p_category)
      and (
        v_query is null
        or s.name ilike '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      )
  ),
  filtered as (
    select
      c.*,
      case p_sort
        when 'rating' then -c.rating_avg::numeric
        when 'distance' then c.distance_value
        else c.relevance_value
      end as ordering_value
    from candidates c
    where (not coalesce(p_open_now, false) or c.open_now)
      and (p_min_rating is null or c.rating_avg >= p_min_rating)
      and (not coalesce(p_has_promotion, false) or c.promotion_active)
      and (p_sort <> 'distance' or c.distance_value is not null)
  )
  select
    f.id,
    f.slug,
    f.name,
    f.description,
    f.category,
    f.logo_path,
    f.city,
    f.district,
    f.rating_avg,
    f.rating_count,
    f.open_now,
    f.promotion_active,
    f.distance_value,
    f.ordering_value
  from filtered f
  where p_cursor_value is null
    or f.ordering_value > p_cursor_value
    or (f.ordering_value = p_cursor_value and f.id > p_cursor_id)
  order by f.ordering_value, f.id
  limit least(greatest(coalesce(p_limit, 12), 1), 24);
end;
$$;

revoke all on function public.search_shops(
  text, text, text, public.shop_category, boolean, numeric, boolean, text,
  double precision, double precision, numeric, uuid, integer
) from public, anon, authenticated;
grant execute on function public.search_shops(
  text, text, text, public.shop_category, boolean, numeric, boolean, text,
  double precision, double precision, numeric, uuid, integer
) to anon, authenticated;
