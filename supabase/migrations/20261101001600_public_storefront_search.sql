create index if not exists services_name_trgm_idx
  on public.services using gin (name extensions.gin_trgm_ops);

create or replace function public.search_public_storefront_products(
  p_shop uuid,
  p_query text,
  p_category uuid default null
)
returns table (
  id uuid,
  name text,
  description text,
  price integer,
  compare_at_price integer,
  category_id uuid,
  status text
)
language sql
stable
set search_path = ''
as $$
  with query_input as (
    select left(btrim(coalesce(p_query, '')), 100) as value
  )
  select
    p.id,
    p.name,
    p.description,
    p.price,
    p.compare_at_price,
    p.category_id,
    p.status::text
  from public.products p
  cross join query_input q
  where p.shop_id = p_shop
    and p.status <> 'hidden'
    and p.is_sample = false
    and p.deleted_at is null
    and (p_category is null or p.category_id = p_category)
    and (
      q.value = ''
      or p.search_vector @@ websearch_to_tsquery('french', extensions.unaccent(q.value))
      or p.name OPERATOR(extensions.%) q.value
      or p.name ilike '%' || q.value || '%'
    )
  order by
    case
      when q.value = '' then 0
      when p.search_vector @@ websearch_to_tsquery('french', extensions.unaccent(q.value)) then 0
      else 1
    end,
    p.created_at desc
  limit 60
$$;

revoke all on function public.search_public_storefront_products(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.search_public_storefront_products(uuid, text, uuid)
  to anon, authenticated;
