import { CircleDot } from "lucide-react";
import { signIn } from "@/auth";
import styles from "./page.module.css";

// Standalone full-screen login (rendered with only the root layout — no app sidebar). The proxy
// redirects unauthenticated web visitors here and sends them to /budget once signed in.
export default function LoginPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <CircleDot size={26} color="#fff" strokeWidth={2.4} />
          </div>
          <div>
            <div className={styles.title}>Assign</div>
            <div className={styles.subtitle}>ZERO-BASED BUDGET</div>
          </div>
        </div>

        <p className={styles.blurb}>Sign in to your budget. Your data stays private to your account.</p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/budget" });
          }}
        >
          <button type="submit" className={styles.googleBtn}>
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}

// Inline Google "G" mark (brand colors) so the button reads as an official Google sign-in.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
