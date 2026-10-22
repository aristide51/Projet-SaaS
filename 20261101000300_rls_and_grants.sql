-- =====================================================================
-- 0003 : RLS + droits en LISTE BLANCHE
-- 1) RLS activee sur toutes les tables  2) tout est retire a anon/authenticated
-- 3) on accorde ensuite explicitement colonne par colonne ce qui est permis.
-- Toute nouvelle table doit recevoir ici (ou dans une nouvelle migration)
-- sa RLS, ses politiques ET ses GRANT, avec un test.
-- =====================================================================

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Fonctions : rien n'est appelable par defaut ; les RPC sont ouvertes une par une plus bas.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on function private.apply_order_transition(uuid, public.order_status, public.actor_type, uuid, text, text) from public, anon, authenticated;
revoke execute on function private.restock_order(uuid)                          from public, anon, authenticated;
revoke execute on function private.write_audit(uuid, text, text, uuid, jsonb)   from public, anon, authenticated;
revoke execute on function private.current_plan(uuid)                           from public, anon, authenticated;
revoke execute on function private.plan_limits(uuid)                            from public, anon, authenticated;
revoke execute on function private.plan_feature(uuid, text)                     from public, anon, authenticated;
revoke execute on function private.generate_order_code()                        from public, anon, authenticated;

-- ---------- profiles ----------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;   -- role_global JAMAIS modifiable ici
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- shops ----------
grant select on public.shops to anon, authenticated;
grant insert (created_by, slug, name, description, category, logo_path, brand_color, whatsapp, phone, city, district, address, lat, lng, opening_hours)
  on public.shops to authenticated;
grant update (slug, name, description, category, logo_path, brand_color, whatsapp, phone, city, district, address, lat, lng, opening_hours)
  on public.shops to authenticated;
create policy shops_select on public.shops for select to anon, authenticated
  using ((review_status = 'approved' and not is_suspended)
         or created_by = (select auth.uid()) or private.is_shop_member(id) or private.is_admin());
create policy shops_insert on public.shops for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy shops_update on public.shops for update to authenticated
  using (private.is_shop_owner(id)) with check (private.is_shop_owner(id));

-- ---------- equipe, reglages, onboarding ----------
grant select, delete on public.shop_members to authenticated;
grant update (permissions) on public.shop_members to authenticated;
create policy shop_members_select on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_shop_member(shop_id) or private.is_admin());
create policy shop_members_update on public.shop_members for update to authenticated
  using (private.is_shop_owner(shop_id) and role <> 'owner') with check (private.is_shop_owner(shop_id) and role <> 'owner');
create policy shop_members_delete on public.shop_members for delete to authenticated
  using (private.is_shop_owner(shop_id) and role <> 'owner');

grant select on public.shop_settings to anon, authenticated;
grant update (order_expiry_online_minutes, order_expiry_manual_hours, manual_payment_max_amount, pickup_enabled,
              delivery_enabled, booking_auto_confirm, booking_min_notice_hours, booking_cancel_before_hours)
  on public.shop_settings to authenticated;
create policy shop_settings_select on public.shop_settings for select to anon, authenticated
  using (private.is_shop_public(shop_id) or private.is_shop_member(shop_id) or private.is_admin());
create policy shop_settings_update on public.shop_settings for update to authenticated
  using (private.has_shop_permission(shop_id, 'settings')) with check (private.has_shop_permission(shop_id, 'settings'));

grant select on public.shop_onboarding to authenticated;
grant update (current_step, draft) on public.shop_onboarding to authenticated;
create policy shop_onboarding_select on public.shop_onboarding for select to authenticated
  using (private.has_shop_permission(shop_id, 'settings'));
create policy shop_onboarding_update on public.shop_onboarding for update to authenticated
  using (private.has_shop_permission(shop_id, 'settings')) with check (private.has_shop_permission(shop_id, 'settings'));

-- Modes d'encaissement (numeros USSD, etc.)
grant select, insert, update, delete on public.shop_payment_methods to authenticated;
create policy shop_payment_methods_select on public.shop_payment_methods for select to authenticated
  using (private.is_shop_public(shop_id) or private.is_shop_member(shop_id) or private.is_admin());
create policy shop_payment_methods_write on public.shop_payment_methods for all to authenticated
  using (private.has_shop_permission(shop_id, 'payments')) with check (private.has_shop_permission(shop_id, 'payments'));

-- shop_payment_accounts et webhook_events : RLS active, AUCUN droit, AUCUNE politique
-- => accessibles uniquement par service_role (Edge Functions).

-- ---------- catalogue ----------
grant select on public.categories, public.product_variants, public.product_images, public.resources,
                public.availability_rules to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select (id, shop_id, category_id, name, description, price, compare_at_price, sku, compatibility, stock,
              status, is_sample, deleted_at, created_at, updated_at) on public.products to anon, authenticated;
grant insert, update, delete on public.categories, public.product_variants, public.product_images,
                               public.services, public.resources, public.availability_rules to authenticated;
grant insert (shop_id, category_id, name, description, price, compare_at_price, sku, compatibility, stock, status, is_sample, deleted_at)
  on public.products to authenticated;
grant update (category_id, name, description, price, compare_at_price, sku, compatibility, stock, status, is_sample, deleted_at)
  on public.products to authenticated;
grant delete on public.products to authenticated;

create policy categories_select on public.categories for select to anon, authenticated
  using (private.is_shop_public(shop_id) or private.is_shop_member(shop_id) or private.is_admin());
create policy categories_write on public.categories for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog')) with check (private.has_shop_permission(shop_id, 'catalog'));

create policy products_select on public.products for select to anon, authenticated
  using ((private.is_shop_public(shop_id) and status <> 'hidden' and deleted_at is null)
         or private.is_shop_member(shop_id) or private.is_admin());
create policy products_write on public.products for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog')) with check (private.has_shop_permission(shop_id, 'catalog'));

-- Variantes et images : visibles si le produit parent l'est (la RLS de products s'applique dans la sous-requete).
create policy product_variants_select on public.product_variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_variants_write on public.product_variants for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog')) with check (private.has_shop_permission(shop_id, 'catalog'));
create policy product_images_select on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_write on public.product_images for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog')) with check (private.has_shop_permission(shop_id, 'catalog'));

create policy services_select on public.services for select to anon, authenticated
  using ((private.is_shop_public(shop_id) and active and deleted_at is null)
         or private.is_shop_member(shop_id) or private.is_admin());
create policy services_write on public.services for all to authenticated
  using (private.has_shop_permission(shop_id, 'catalog')) with check (private.has_shop_permission(shop_id, 'catalog'));

-- ---------- rendez-vous : ressources, horaires, fermetures ----------
create policy resources_select on public.resources for select to anon, authenticated
  using (private.is_shop_public(shop_id) or private.is_shop_member(shop_id) or private.is_admin());
create policy resources_write on public.resources for all to authenticated
  using (private.has_shop_permission(shop_id, 'bookings')) with check (private.has_shop_permission(shop_id, 'bookings'));
create policy availability_select on public.availability_rules for select to anon, authenticated
  using (private.is_shop_public(shop_id) or private.is_shop_member(shop_id) or private.is_admin());
create policy availability_write on public.availability_rules for all to authenticated
  using (private.has_shop_permission(shop_id, 'bookings')) with check (private.has_shop_permission(shop_id, 'bookings'));

grant select, insert, update, delete on public.time_off to authenticated;
create policy time_off_all on public.time_off for all to authenticated
  using (private.has_shop_permission(shop_id, 'bookings')) with check (private.has_shop_permission(shop_id, 'bookings'));

-- Les reservations s'ecrivent uniquement via book_slot / set_booking_status.
grant select on public.bookings to authenticated;
create policy bookings_select on public.bookings for select to authenticated
  using (customer_id = (select auth.uid()) or private.has_shop_permission(shop_id, 'bookings') or private.is_admin());

-- ---------- panier ----------
grant select, insert, delete on public.carts to authenticated;
create policy carts_select on public.carts for select to authenticated using (customer_id = (select auth.uid()));
create policy carts_insert on public.carts for insert to authenticated
  with check (customer_id = (select auth.uid()) and private.is_shop_public(shop_id));
create policy carts_delete on public.carts for delete to authenticated using (customer_id = (select auth.uid()));

grant select, insert, delete on public.cart_items to authenticated;
grant update (quantity) on public.cart_items to authenticated;
create policy cart_items_all on public.cart_items for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id))
  with check (exists (select 1 from public.carts c where c.id = cart_id));

-- ---------- commandes (lecture seule : ecritures via RPC) ----------
grant select on public.orders, public.order_items, public.order_status_history, public.payment_declarations to authenticated;
create policy orders_select on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or private.has_shop_permission(shop_id, 'orders') or private.is_admin());
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy payment_declarations_select on public.payment_declarations for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

grant select on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated
  using ((order_id is not null and exists (select 1 from public.orders o where o.id = order_id))
      or (booking_id is not null and exists (select 1 from public.bookings b where b.id = booking_id)));

-- ---------- promotions ----------
grant select, insert, update, delete on public.coupons to authenticated;
create policy coupons_all on public.coupons for all to authenticated
  using (private.has_shop_permission(shop_id, 'promotions') or private.is_admin())
  with check (private.has_shop_permission(shop_id, 'promotions'));
grant select on public.coupon_redemptions to authenticated;
create policy coupon_redemptions_select on public.coupon_redemptions for select to authenticated
  using (private.has_shop_permission(shop_id, 'promotions') or private.is_admin());

-- ---------- avis ----------
-- Public : sans identifiant client. Connecte : ligne complete (customer_id utile pour "mon avis").
grant select (id, shop_id, rating, comment, photo_paths, author_name, status, shop_reply, shop_replied_at, created_at)
  on public.reviews to anon;
grant select on public.reviews to authenticated;
grant insert (shop_id, customer_id, order_id, booking_id, rating, comment, photo_paths) on public.reviews to authenticated;
grant update (rating, comment, photo_paths) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
create policy reviews_select on public.reviews for select to anon, authenticated
  using ((status = 'published' and private.is_shop_public(shop_id))
         or customer_id = (select auth.uid()) or private.has_shop_permission(shop_id, 'reviews') or private.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated
  with check (customer_id = (select auth.uid()));
create policy reviews_update on public.reviews for update to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy reviews_delete on public.reviews for delete to authenticated
  using (customer_id = (select auth.uid()));

-- ---------- plateforme ----------
grant select on public.plans to anon, authenticated;
create policy plans_select on public.plans for select to anon, authenticated using (active);
grant select on public.subscriptions, public.invoices to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (private.is_shop_owner(shop_id) or private.is_admin());
create policy invoices_select on public.invoices for select to authenticated
  using (private.is_shop_owner(shop_id) or private.is_admin());

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log for select to authenticated using (private.is_admin());

-- ---------- RPC ouvertes aux utilisateurs connectes ----------
grant execute on function
  public.transition_order(uuid, public.order_status, text, text),
  public.declare_payment(uuid, text, text, text),
  public.create_order_from_cart(uuid, public.payment_method_type, public.fulfillment_type, text, text, text),
  public.book_slot(uuid, uuid, timestamptz, text),
  public.set_booking_status(uuid, public.booking_status, text),
  public.submit_shop_for_review(uuid),
  public.review_shop(uuid, boolean, text),
  public.set_shop_suspended(uuid, boolean, text),
  public.reply_to_review(uuid, text),
  public.moderate_review(uuid, public.review_status)
to authenticated;

-- Reservees au serveur (cron, Edge Functions) :
grant execute on function public.expire_pending_orders() to service_role;
grant execute on function public.transition_order(uuid, public.order_status, text, text) to service_role;
grant all on all tables in schema public to service_role;
-- Valeur par defaut de orders.code : necessaire si service_role insere une commande directement.
grant execute on function private.generate_order_code() to service_role;
