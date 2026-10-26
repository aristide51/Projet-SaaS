drop function public.search_public_storefront_products(uuid, text, uuid);

create function public.search_public_storefront_products(
  p_shop uuid,
  p_query text,
  p_category uuid default null
)
returns table (
  id uuid,
  item_type text,
  name text,
  description text,
  price integer,
  compare_at_price integer,
  category_id uuid,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with query_input as (
    select left(btrim(coalesce(p_query, '')), 100) as value
  ),
  candidates as (
    select
      p.id,
      'product'::text as item_type,
      p.name,
      p.description,
      p.price,
      p.compare_at_price,
      p.category_id,
      p.status::text as status,
      p.created_at,
      case
        when q.value = '' then 0
        when p.search_vector @@ websearch_to_tsquery('french', extensions.unaccent(q.value)) then 0
        else 1
      end as relevance
    from public.products p
    cross join query_input q
    where p.shop_id = p_shop
      and private.is_shop_public(p_shop)
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

    union all

    select
      s.id,
      'service'::text as item_type,
      s.name,
      s.description,
      s.price,
      null::integer as compare_at_price,
      null::uuid as category_id,
      'available'::text as status,
      s.created_at,
      case
        when q.value = '' then 0
        when to_tsvector(
          'french',
          extensions.unaccent(coalesce(s.name, '') || ' ' || coalesce(s.description, ''))
        ) @@ websearch_to_tsquery('french', extensions.unaccent(q.value)) then 0
        else 1
      end as relevance
    from public.services s
    cross join query_input q
    where s.shop_id = p_shop
      and private.is_shop_public(p_shop)
      and p_category is null
      and s.active = true
      and s.is_sample = false
      and s.deleted_at is null
      and (
        q.value = ''
        or to_tsvector(
          'french',
          extensions.unaccent(coalesce(s.name, '') || ' ' || coalesce(s.description, ''))
        ) @@ websearch_to_tsquery('french', extensions.unaccent(q.value))
        or s.name OPERATOR(extensions.%) q.value
        or s.name ilike '%' || q.value || '%'
      )
  )
  select
    c.id,
    c.item_type,
    c.name,
    c.description,
    c.price,
    c.compare_at_price,
    c.category_id,
    c.status
  from candidates c
  order by c.relevance, c.created_at desc
  limit 60
$$;

revoke all on function public.search_public_storefront_products(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.search_public_storefront_products(uuid, text, uuid)
  to anon, authenticated;
