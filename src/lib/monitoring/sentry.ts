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
  | "catalog_category_save_failed"
  | "catalog_category_delete_failed"
  | "catalog_product_save_failed"
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
  | "catalog_image_reorder_failed";

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
