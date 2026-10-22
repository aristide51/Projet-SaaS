-- =====================================================================
-- 0001 : schema (extensions, types, tables, contraintes, index, plans)
-- Regles : montants en entiers FCFA, uuid, timestamptz, shop_id partout.
-- Les tables enfants referencent (id, shop_id) du parent pour qu'un enfant
-- ne puisse jamais appartenir a une autre boutique que son parent.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm    with schema extensions;
create extension if not exists unaccent   with schema extensions;

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- Reference de commande courte et lisible (ex. CMD-4F7K), sans caracteres ambigus.
create or replace function private.generate_order_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := 'CMD-';
begin
  for i in 1..4 loop
    code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;
  return code;
end $$;

-- ---------- Types ----------
create type public.app_role            as enum ('customer', 'admin');
create type public.shop_category       as enum ('hardware', 'auto_parts', 'garage', 'salon', 'other');
create type public.shop_review_status  as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.shop_role           as enum ('owner', 'staff');
create type public.product_status      as enum ('available', 'out_of_stock', 'hidden');
create type public.payment_method_type as enum ('ussd_orange', 'ussd_moov', 'ussd_coris', 'cash_on_delivery', 'pay_at_pickup', 'aggregator');
create type public.order_status        as enum ('pending_payment', 'payment_declared', 'paid', 'confirmed', 'ready', 'completed', 'cancelled', 'refunded');
create type public.fulfillment_type    as enum ('pickup', 'delivery');
create type public.payment_status      as enum ('initiated', 'pending', 'succeeded', 'failed', 'expired', 'refunded');
create type public.declaration_status  as enum ('declared', 'confirmed', 'rejected');
create type public.booking_status      as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
create type public.coupon_type         as enum ('percent', 'fixed');
create type public.review_status       as enum ('published', 'hidden', 'flagged');
create type public.sub_status          as enum ('active', 'past_due', 'expired');
create type public.invoice_status      as enum ('open', 'paid', 'void');
create type public.actor_type          as enum ('customer', 'merchant', 'admin', 'system');

-- ---------- Identite ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (phone ~ '^\+?[0-9]{8,15}$'),
  avatar_url  text,
  role_global public.app_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Boutiques ----------
create table public.shops (
  id               uuid primary key default gen_random_uuid(),
  created_by       uuid not null references auth.users(id),
  slug             text not null unique
                   check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
                   check (slug not in ('www', 'api', 'app', 'admin', 'dashboard', 'support', 'mail', 'static', 'cdn')),
  name             text not null check (char_length(name) between 2 and 80),
  description      text check (char_length(description) <= 2000),
  category         public.shop_category not null default 'other',
  logo_path        text,
  brand_color      text not null default '#1F6FEB' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  whatsapp         text check (whatsapp ~ '^\+?[0-9]{8,15}$'),
  phone            text check (phone ~ '^\+?[0-9]{8,15}$'),
  city             text not null default 'Ouagadougou',
  district         text,
  address          text check (char_length(address) <= 300),
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  opening_hours    jsonb not null default '{}'::jsonb,
  review_status    public.shop_review_status not null default 'draft',
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users(id),
  rejection_reason text,
  is_suspended     boolean not null default false,
  rating_avg       numeric(3,2) not null default 0,
  rating_count     integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.shop_members (
  shop_id     uuid not null references public.shops(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.shop_role not null default 'staff',
  -- permissions des employes : {"catalog":true,"orders":true,"bookings":true,"promotions":false,"reviews":true,"settings":false,"payments":false}
  permissions jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table public.shop_settings (
  shop_id                     uuid primary key references public.shops(id) on delete cascade,
  order_expiry_online_minutes integer not null default 30  check (order_expiry_online_minutes between 10 and 1440),
  order_expiry_manual_hours   integer not null default 2   check (order_expiry_manual_hours between 1 and 24),
  manual_payment_max_amount   integer          default 150000 check (manual_payment_max_amount > 0),
  pickup_enabled              boolean not null default true,
  delivery_enabled            boolean not null default false,
  booking_auto_confirm        boolean not null default false,
  booking_min_notice_hours    integer not null default 2   check (booking_min_notice_hours between 0 and 720),
  booking_cancel_before_hours integer not null default 24  check (booking_cancel_before_hours between 0 and 720),
  updated_at                  timestamptz not null default now()
);

create table public.shop_onboarding (
  shop_id      uuid primary key references public.shops(id) on delete cascade,
  current_step smallint not null default 1 check (current_step between 1 and 8),
  draft        jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create table public.shop_payment_methods (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  type          public.payment_method_type not null,
  phone_or_code text check (char_length(phone_or_code) <= 40),
  ussd_template text check (char_length(ussd_template) <= 80),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (shop_id, type)
);

-- Identifiants chiffres de l'agregateur : lisibles uniquement par service_role.
create table public.shop_payment_accounts (
  shop_id                  uuid primary key references public.shops(id) on delete cascade,
  provider                 text not null,
  credentials_encrypted    text not null,
  webhook_secret_encrypted text,
  status                   text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------- Catalogue ----------
create table public.categories (
  id        uuid primary key default gen_random_uuid(),
  shop_id   uuid not null references public.shops(id) on delete cascade,
  parent_id uuid,
  name      text not null check (char_length(name) between 1 and 80),
  position  integer not null default 0,
  unique (id, shop_id),
  foreign key (parent_id, shop_id) references public.categories (id, shop_id) on delete set null (parent_id)
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  category_id      uuid,
  name             text not null check (char_length(name) between 1 and 160),
  description      text check (char_length(description) <= 4000),
  price            integer not null check (price >= 0),
  compare_at_price integer check (compare_at_price is null or compare_at_price > price),
  sku              text check (char_length(sku) <= 60),
  compatibility    text check (char_length(compatibility) <= 500),
  stock            integer check (stock >= 0),            -- null = stock non suivi
  status           public.product_status not null default 'available',
  is_sample        boolean not null default false,        -- exemple de mise en route
  search_vector    tsvector,
  deleted_at       timestamptz,                           -- corbeille de 30 jours
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (category_id, shop_id) references public.categories (id, shop_id) on delete set null (category_id)
);

create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  product_id uuid not null,
  name       text not null check (char_length(name) between 1 and 80),
  price      integer check (price >= 0),                  -- null = prix du produit
  stock      integer check (stock >= 0),
  unique (id, shop_id),
  foreign key (product_id, shop_id) references public.products (id, shop_id) on delete cascade
);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  product_id uuid not null,
  path       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (product_id, shop_id) references public.products (id, shop_id) on delete cascade
);

create table public.services (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references public.shops(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 160),
  description    text check (char_length(description) <= 4000),
  duration_min   integer not null check (duration_min between 5 and 480),
  price          integer not null check (price >= 0),
  deposit_amount integer not null default 0 check (deposit_amount >= 0),
  active         boolean not null default true,
  is_sample      boolean not null default false,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, shop_id),
  check (deposit_amount <= price)
);

-- ---------- Rendez-vous ----------
create table public.resources (
  id      uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name    text not null check (char_length(name) between 1 and 80),
  active  boolean not null default true,
  unique (id, shop_id)
);

create table public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null,
  resource_id uuid not null,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = dimanche
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time),
  foreign key (resource_id, shop_id) references public.resources (id, shop_id) on delete cascade
);

create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  resource_id uuid,                                     -- null = toute la boutique
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text check (char_length(reason) <= 200),
  check (ends_at > starts_at),
  foreign key (resource_id, shop_id) references public.resources (id, shop_id) on delete cascade
);

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  service_id       uuid not null,
  resource_id      uuid not null,
  customer_id      uuid not null references auth.users(id),
  during           tstzrange not null,
  status           public.booking_status not null default 'pending',
  customer_note    text check (char_length(customer_note) <= 500),
  customer_name    text,
  customer_phone   text,
  cancelled_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (service_id, shop_id)  references public.services  (id, shop_id),
  foreign key (resource_id, shop_id) references public.resources (id, shop_id),
  check (not lower_inf(during) and not upper_inf(during)),
  check (lower_inc(during) and not upper_inc(during)),
  check (lower(during) < upper(during)),
  -- ANTI DOUBLE-RESERVATION : deux creneaux actifs ne peuvent pas se chevaucher sur une meme ressource.
  constraint bookings_no_overlap exclude using gist (
    resource_id with =,
    during with &&
  ) where (status in ('pending', 'confirmed'))
);

-- ---------- Panier et commandes ----------
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (id, shop_id),
  unique (shop_id, customer_id)
);

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null,
  cart_id    uuid not null,
  product_id uuid not null,
  variant_id uuid,
  quantity   integer not null check (quantity between 1 and 99),
  foreign key (cart_id, shop_id)    references public.carts (id, shop_id) on delete cascade,
  foreign key (product_id, shop_id) references public.products (id, shop_id) on delete cascade,
  foreign key (variant_id, shop_id) references public.product_variants (id, shop_id) on delete cascade
);
create unique index cart_items_unique_line on public.cart_items (cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references public.shops(id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  type               public.coupon_type not null,
  value              integer not null check (value > 0),
  min_amount         integer not null default 0 check (min_amount >= 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  max_uses           integer check (max_uses > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  used_count         integer not null default 0,
  scope              jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (shop_id, code),
  unique (id, shop_id),
  check (type <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  customer_id       uuid not null references auth.users(id),
  code              text not null default private.generate_order_code(),
  status            public.order_status not null default 'pending_payment',
  payment_method    public.payment_method_type not null,
  fulfillment       public.fulfillment_type not null default 'pickup',
  delivery_address  text check (char_length(delivery_address) <= 300),
  note              text check (char_length(note) <= 500),
  customer_name     text,
  customer_phone    text,
  subtotal          integer not null check (subtotal >= 0),
  discount          integer not null default 0 check (discount >= 0),
  total             integer not null check (total >= 0),
  coupon_id         uuid references public.coupons(id) on delete set null,
  expires_at        timestamptz,
  reject_count      integer not null default 0,
  paid_at           timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_reason  text,
  refunded_at       timestamptz,
  refund_reference  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, shop_id),
  unique (shop_id, code),
  check (total = subtotal - discount),
  check (fulfillment <> 'delivery' or delivery_address is not null)
);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null,
  order_id      uuid not null,
  product_id    uuid,
  variant_id    uuid,
  name_snapshot text not null,
  unit_price    integer not null check (unit_price >= 0),
  quantity      integer not null check (quantity > 0),
  foreign key (order_id, shop_id)   references public.orders (id, shop_id) on delete cascade,
  foreign key (product_id, shop_id) references public.products (id, shop_id) on delete set null (product_id),
  foreign key (variant_id, shop_id) references public.product_variants (id, shop_id) on delete set null (variant_id)
);

create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null,
  order_id    uuid not null,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_type  public.actor_type not null,
  actor_id    uuid,
  note        text,
  reference   text,
  created_at  timestamptz not null default now(),
  foreign key (order_id, shop_id) references public.orders (id, shop_id) on delete cascade
);

create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null,
  coupon_id   uuid not null,
  customer_id uuid not null references auth.users(id),
  order_id    uuid not null unique references public.orders(id) on delete cascade,
  created_at  timestamptz not null default now(),
  foreign key (coupon_id, shop_id) references public.coupons (id, shop_id) on delete cascade
);

-- ---------- Paiements ----------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null,
  order_id        uuid,
  booking_id      uuid,
  provider        text not null,
  provider_ref    text,
  idempotency_key text not null unique,
  amount          integer not null check (amount > 0),
  status          public.payment_status not null default 'initiated',
  raw_webhook     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (num_nonnulls(order_id, booking_id) = 1),
  foreign key (order_id, shop_id)   references public.orders (id, shop_id),
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id)
);
create unique index payments_provider_ref_unique on public.payments (provider, provider_ref) where provider_ref is not null;

create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- Declarations de paiement USSD (paiement manuel verifie par le commercant).
create table public.payment_declarations (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null,
  order_id       uuid not null,
  payer_phone    text not null check (payer_phone ~ '^\+?[0-9]{8,15}$'),
  transaction_ref text not null check (transaction_ref ~ '^[A-Z0-9._-]{4,40}$'),
  screenshot_path text,
  status         public.declaration_status not null default 'declared',
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,
  reject_reason  text,
  created_at     timestamptz not null default now(),
  foreign key (order_id, shop_id) references public.orders (id, shop_id) on delete cascade
);
-- Une meme reference de transaction ne peut pas servir a deux commandes d'une boutique.
create unique index payment_declarations_ref_unique on public.payment_declarations (shop_id, transaction_ref) where status <> 'rejected';

-- ---------- Avis ----------
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null,
  customer_id    uuid not null references auth.users(id) on delete cascade,
  order_id       uuid unique,
  booking_id     uuid unique,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (char_length(comment) <= 2000),
  photo_paths    text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  author_name    text,
  status         public.review_status not null default 'published',
  shop_reply     text check (char_length(shop_reply) <= 1000),
  shop_replied_at timestamptz,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(order_id, booking_id) = 1),
  foreign key (order_id, shop_id)   references public.orders (id, shop_id) on delete cascade,
  foreign key (booking_id, shop_id) references public.bookings (id, shop_id) on delete cascade
);

-- ---------- Plateforme : plans, abonnements, factures ----------
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  price_monthly integer not null check (price_monthly >= 0),
  limits        jsonb not null default '{}'::jsonb,
  features      jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  sort_order    integer not null default 0
);

create table public.subscriptions (
  shop_id            uuid primary key references public.shops(id) on delete cascade,
  plan_id            uuid not null references public.plans(id),
  status             public.sub_status not null default 'active',
  current_period_end timestamptz,
  grace_until        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  plan_id       uuid not null references public.plans(id),
  amount        integer not null check (amount >= 0),
  status        public.invoice_status not null default 'open',
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  due_at        timestamptz not null,
  paid_at       timestamptz,
  payment_ref   text,
  pdf_path      text,
  created_at    timestamptz not null default now()
);

-- ---------- Divers ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  shop_id    uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Index ----------
create index shops_public_idx          on public.shops (city, district, category) where review_status = 'approved' and not is_suspended;
create index shop_members_user_idx     on public.shop_members (user_id);
create index categories_shop_idx       on public.categories (shop_id);
create index products_shop_idx         on public.products (shop_id, status) where deleted_at is null;
create index products_search_idx       on public.products using gin (search_vector);
create index products_name_trgm_idx    on public.products using gin (name extensions.gin_trgm_ops);
create index product_images_product_idx on public.product_images (product_id);
create index product_variants_product_idx on public.product_variants (product_id);
create index services_shop_idx         on public.services (shop_id) where deleted_at is null;
create index availability_resource_idx on public.availability_rules (resource_id, weekday);
create index time_off_shop_idx         on public.time_off (shop_id, starts_at);
create index bookings_customer_idx     on public.bookings (customer_id, created_at desc);
create index bookings_shop_idx         on public.bookings (shop_id, status);
create index orders_shop_idx           on public.orders (shop_id, status, created_at desc);
create index orders_customer_idx       on public.orders (customer_id, created_at desc);
create index orders_expiry_idx         on public.orders (expires_at) where status = 'pending_payment' and expires_at is not null;
create index order_items_order_idx     on public.order_items (order_id);
create index order_history_order_idx   on public.order_status_history (order_id, created_at);
create index payments_order_idx        on public.payments (order_id);
create index payment_declarations_order_idx on public.payment_declarations (order_id);
create index reviews_shop_idx          on public.reviews (shop_id, created_at desc) where status = 'published';
create index notifications_user_idx    on public.notifications (user_id, created_at desc);
create index audit_log_shop_idx        on public.audit_log (shop_id, created_at desc);
create index cart_items_cart_idx       on public.cart_items (cart_id);
create index invoices_shop_idx         on public.invoices (shop_id, due_at desc);

-- ---------- Plans de depart (a ajuster apres tests avec les commercants) ----------
insert into public.plans (code, name, price_monthly, limits, features, sort_order) values
  ('free',    'Gratuit',  0,     '{"max_products": 15,   "max_staff": 1}',  '{"bookings": false, "promotions": false, "analytics": false}', 1),
  ('pro',     'Pro',      7500,  '{"max_products": null, "max_staff": 3}',  '{"bookings": true,  "promotions": true,  "analytics": true}',  2),
  ('premium', 'Premium',  15000, '{"max_products": null, "max_staff": 10}', '{"bookings": true,  "promotions": true,  "analytics": true, "priority_support": true}', 3);
