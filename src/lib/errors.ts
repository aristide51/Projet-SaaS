type ProviderError = {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_not_confirmed: "Confirme ton adresse e-mail avant de te connecter.",
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  over_email_send_rate_limit:
    "Trop de demandes. Patiente un instant avant de réessayer.",
  over_request_rate_limit:
    "Trop de tentatives. Patiente un instant avant de réessayer.",
  weak_password: "Choisis un mot de passe plus sûr.",
  user_already_exists: "Un compte existe déjà avec cette adresse e-mail.",
  validation_failed: "Les informations saisies ne sont pas valides.",
};

export function getAuthErrorMessage(error: ProviderError): string {
  const normalizedCode = error.code?.toLowerCase();
  const knownCodeMessage = normalizedCode
    ? AUTH_ERROR_MESSAGES[normalizedCode]
    : undefined;

  if (knownCodeMessage) {
    return knownCodeMessage;
  }

  const normalizedMessage = error.message?.toLowerCase() ?? "";

  if (normalizedMessage.includes("email not confirmed")) {
    return AUTH_ERROR_MESSAGES.email_not_confirmed ?? "Connexion impossible.";
  }

  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid_credentials")
  ) {
    return AUTH_ERROR_MESSAGES.invalid_credentials ?? "Connexion impossible.";
  }

  if (normalizedMessage.includes("already registered")) {
    return (
      AUTH_ERROR_MESSAGES.user_already_exists ??
      "Création du compte impossible."
    );
  }

  return "Une erreur est survenue. Vérifie les informations puis réessaie.";
}
