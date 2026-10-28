import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
type MonitoringEvent =
  | "app_error_boundary"
  | "global_error_boundary"
  | "auth_turnstile_verification_failed"
  | "auth_signup_failed"
  | "auth_signin_failed"
  | "auth_magic_link_failed"
  | "auth_password_reset_request_failed"
  | "auth_password_update_failed"
  | "auth_google_signin_failed"
  | "auth_signout_failed"
  | "profile_phone_update_failed"
  | "profile_read_before_update_failed"
  | "profile_avatar_upload_failed"
  | "profile_avatar_cleanup_failed"
  | "profile_update_failed"
  | "profile_old_avatar_remove_failed"
  | "account_deletion_request_failed"
  | "reauth_password_failed"
  | "reauth_magic_link_failed"
  | "shop_onboarding_create_failed"
  | "shop_onboarding_slug_check_failed"
  | "shop_onboarding_save_failed"
  | "shop_onboarding_logo_upload_failed"
  | "shop_onboarding_logo_cleanup_failed"
  | "shop_onboarding_payment_methods_save_failed"
  | "shop_onboarding_submit_failed"
  | "catalog_category_save_failed"
  | "catalog_category_delete_failed"
  | "catalog_product_save_failed"
  | "catalog_product_limit_lookup_failed"
  | "catalog_product_variants_reload_failed"
  | "catalog_service_save_failed"
  | "catalog_item_archive_failed"
  | "catalog_image_parent_check_failed"
  | "catalog_image_count_failed"
  | "catalog_image_upload_failed"
  | "catalog_image_record_failed"
  | "catalog_image_cleanup_failed"
  | "catalog_image_lookup_failed"
  | "catalog_image_delete_failed"
  | "catalog_image_record_delete_failed"
  | "catalog_image_reorder_failed"
  | "catalog_csv_count_failed"
  | "catalog_csv_limit_failed"
  | "catalog_csv_category_lookup_failed"
  | "catalog_csv_category_create_failed"
  | "catalog_csv_product_failed"
  | "catalog_csv_import_failed"
  | "catalog_csv_capacity_failed"
  | "catalog_csv_batch_failed"
  | "catalog_sample_seed_failed"
  | "team_invitation_cleanup_failed"
  | "team_invitation_create_failed"
  | "team_invitation_email_failed"
  | "team_invitation_resend_failed"
  | "team_invitation_revoke_failed"
  | "team_permissions_update_failed"
  | "team_staff_remove_failed"
  | "team_invitation_accept_failed"
  | "admin_shop_review_failed"
  | "admin_shop_review_email_failed"
  | "admin_shop_suspension_failed"
  | "notifications_list_failed"
  | "notifications_mark_read_failed"
  | "cart_auth_check_failed"
  | "cart_add_failed"
  | "cart_update_failed"
  | "cart_remove_failed"
  | "cart_snapshot_failed"
  | "cart_guest_merge_failed"
  | "orders_list_failed"
  | "order_detail_failed"
  | "orders_confirm_payment_failed"
  | "orders_reject_declaration_failed"
  | "orders_mark_paid_manually_failed"
  | "orders_progress_status_failed"
  | "orders_refund_failed"
  | "orders_cancel_failed"
  | "orders_cancellation_request_resolve_failed"
  | "orders_cancellation_requests_list_failed"
  | "orders_export_csv_failed"
  | "orders_payment_proof_path_invalid"
  | "orders_payment_proof_signed_url_failed"
  | "customer_order_cancel_failed"
  | "customer_order_cancellation_request_failed"
  | "checkout_page_data_failed"
  | "checkout_preview_failed"
  | "checkout_order_failed"
  | "payment_page_order_read_failed"
  | "payment_page_details_read_failed"
  | "payment_proof_upload_failed"
  | "payment_proof_cleanup_failed"
  | "payment_declaration_failed"
  | "subscription_invoice_pdf_failed"
  | "subscription_invoice_pdf_invalid_response"
  | "subscription_invoice_pdf_untrusted_url"
  | "bookings_access_check_failed"
  | "booking_availability_save_failed"
  | "booking_time_off_save_failed"
  | "booking_time_off_delete_failed"
  | "booking_resource_save_failed"
  | "booking_resource_delete_failed"
  | "booking_service_save_failed"
  | "booking_service_delete_failed"
  | "booking_settings_save_failed"
  | "booking_nearby_slots_lookup_failed"
  | "booking_service_lookup_failed"
  | "booking_resource_lookup_failed"
  | "booking_slots_lookup_failed"
  | "booking_shop_lookup_failed"
  | "booking_create_entity_lookup_failed"
  | "booking_create_failed"
  | "booking_cancel_failed"
  | "booking_status_update_failed"
  | "coupon_access_check_failed"
  | "coupon_save_failed"
  | "review_create_failed"
  | "review_photo_upload_failed"
  | "review_photo_attach_failed"
  | "review_photo_cleanup_failed"
  | "review_cleanup_failed"
  | "review_report_failed"
  | "review_reply_failed"
  | "review_report_resolution_failed"
  | "review_moderation_failed"
  | "review_moderation_shop_lookup_failed"
  | "storefront_visit_record_failed";

export function initializeSentry() {
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: true,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.extra;
      delete event.contexts;
      delete event.breadcrumbs;
      delete event.message;
      delete event.logentry;

      for (const exception of event.exception?.values ?? []) {
        exception.value = "Détails d’erreur masqués";
      }

      return event;
    },
  });
}

export async function logError(event: MonitoringEvent, error: unknown) {
  console.error(JSON.stringify({ level: "error", event }));

  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("application_event", event);
    Sentry.captureException(error);
  });
}
