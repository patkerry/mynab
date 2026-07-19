import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { getSidebarData } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";
import { ModalProvider } from "@/components/modal/ModalContext";
import { ToastProvider } from "@/components/toast/ToastContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Assign — Zero-Based Budget",
  description: "A YNAB-style zero-based budgeting app.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <html lang="en" className={inter.className}>
      <body>
        <ToastProvider>
          <ModalProvider>
            <div className="ynab-root">
              <Suspense fallback={null}>
                <Sidebar accounts={accounts} acctBalance={acctBalance} netWorth={netWorth} isAdmin={isAdmin} showAuth={!isDesktop} />
              </Suspense>
              <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
            </div>
          </ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
