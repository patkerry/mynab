// Sign-in allowlist logic, kept pure (no env/DB access) so it can be unit-tested. The web auth
// layer (src/auth.ts) reads AUTH_ALLOWED_EMAILS from the environment and delegates here.
//
// Semantics: an empty/absent allowlist allows ANY email (open sign-up — each new user gets their own
// isolated budget). A non-empty allowlist permits ONLY the listed addresses (case-insensitive,
// whitespace-trimmed). Fail-open on the empty case is intentional and documented — the lockdown is
// opt-in via the env var.

/** Parse a comma-separated `AUTH_ALLOWED_EMAILS` value into a normalized lowercase set. */
export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True if `email` may sign in given the parsed allowlist. Empty allowlist ⇒ everyone allowed. */
export function isEmailAllowed(allowed: Set<string>, email: string): boolean {
  return allowed.size === 0 || allowed.has(email.trim().toLowerCase());
}
