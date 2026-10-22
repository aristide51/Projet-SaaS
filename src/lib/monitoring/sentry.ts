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
  | "auth_signout_failed";

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

  const Sentry = await import("@sentry/nextjs");
  Sentry.withScope((scope) => {
    scope.setTag("application_event", event);
    Sentry.captureException(error);
  });
}
