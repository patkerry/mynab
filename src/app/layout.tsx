import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { getSidebarData } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";
import { ModalProvider } from "@/components/modal/ModalContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Assign — Zero-Based Budget",
  description: "A YNAB-style zero-based budgeting app.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { accounts, acctBalance, netWorth } = await getSidebarData();

  return (
    <html lang="en" className={inter.className}>
      <body>
        <ModalProvider>
          <div className="ynab-root">
            <Suspense fallback={null}>
              <Sidebar accounts={accounts} acctBalance={acctBalance} netWorth={netWorth} />
            </Suspense>
            <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
          </div>
        </ModalProvider>
      </body>
    </html>
  );
}
