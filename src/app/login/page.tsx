import { CircleDot } from "lucide-react";
import { signIn } from "@/auth";

// Standalone full-screen login (rendered with only the root layout — no app sidebar). The proxy
// redirects unauthenticated web visitors here and sends them to /budget once signed in.
export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "var(--paper)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "40px 32px",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--accent)", display: "grid", placeItems: "center" }}>
            <CircleDot size={26} color="#fff" strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>Assign</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", fontWeight: 600, letterSpacing: ".08em", marginTop: 2 }}>
              ZERO-BASED BUDGET
            </div>
          </div>
        </div>

        <p style={{ color: "var(--ink2)", fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
          Sign in to your budget. Your data stays private to your account.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/budget" });
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "#1f2328",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
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
