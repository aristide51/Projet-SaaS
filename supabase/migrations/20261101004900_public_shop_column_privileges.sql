-- Les visiteurs ne lisent que les champs utiles aux vitrines publiques.
-- La politique RLS shops_select continue de filtrer les lignes publiées.
revoke select on public.shops from anon;

grant select (
  id,
  slug,
  name,
  description,
  category,
  logo_path,
  brand_color,
  whatsapp,
  phone,
  city,
  district,
  address,
  lat,
  lng,
  opening_hours,
  rating_avg,
  rating_count,
  updated_at
) on public.shops to anon;
