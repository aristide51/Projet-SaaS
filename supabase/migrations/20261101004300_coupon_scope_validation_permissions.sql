create or replace function private.valid_coupon_scope(p_scope jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_scope) = 'object'
    and (p_scope - 'product_ids' - 'category_ids') = '{}'::jsonb
    and (
      not (p_scope ? 'product_ids')
      or (
        jsonb_typeof(p_scope -> 'product_ids') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements(p_scope -> 'product_ids') item
          where jsonb_typeof(item) <> 'string'
             or item #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    )
    and (
      not (p_scope ? 'category_ids')
      or (
        jsonb_typeof(p_scope -> 'category_ids') = 'array'
        and not exists (
          select 1
          from jsonb_array_elements(p_scope -> 'category_ids') item
          where jsonb_typeof(item) <> 'string'
             or item #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    );
$$;

grant execute on function private.valid_coupon_scope(jsonb) to authenticated;
