import { signIn } from "@/auth";

// Minimal Google-only sign-in page. The proxy redirects unauthenticated web visitors here and sends
// them to /budget once signed in. (Desktop never reaches this — its proxy short-circuits.)
export default function LoginPage() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>mynab</h1>
        <p style={{ color: "#666", marginBottom: "2rem" }}>Zero-based budgeting. Sign in to continue.</p>
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
              padding: "0.75rem 1rem",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
