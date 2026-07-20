import { Suspense } from "react";
import { getSidebarData } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";

// Layout for the authenticated app (Budget / Transactions / Reports / Admin): renders the sidebar
// shell around the page. Public pages like /login live outside this group and get only the root
// layout, so they render as a clean full-screen page with no sidebar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { accounts, acctBalance, netWorth } = await getSidebarData();

  // Auth-aware nav is web-only. On the desktop (SQLite) build there's no session/admin, and calling
  // Auth.js there would need AUTH_SECRET — so resolve it only on web, via dynamic import.
  const isDesktop = process.env.DB_PROVIDER === "sqlite";
  let isAdmin = false;
  if (!isDesktop) {
    const { auth } = await import("@/auth");
    const session = await auth();
    isAdmin = session?.user?.isAdmin ?? false;
  }

  // "Reset demo data" wipes the budget and reseeds sample data — useful for demos/dev, but a scary,
  // destructive footgun in normal use. Off unless ENABLE_DEMO_RESET=true (feature flag).
  const showDemoReset = process.env.ENABLE_DEMO_RESET === "true";

  return (
    <div className="ynab-root">
      <Suspense fallback={null}>
        <Sidebar accounts={accounts} acctBalance={acctBalance} netWorth={netWorth} isAdmin={isAdmin} showAuth={!isDesktop} showDemoReset={showDemoReset} />
      </Suspense>
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
    </div>
  );
}
