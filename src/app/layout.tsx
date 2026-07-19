import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ModalProvider } from "@/components/modal/ModalContext";
import { ToastProvider } from "@/components/toast/ToastContext";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Assign — Zero-Based Budget",
  description: "A YNAB-style zero-based budgeting app.",
};

// Root layout: just the document shell + app-wide providers. The authenticated app's sidebar lives
// in the (app) route group's layout, so public pages (e.g. /login) render clean and full-screen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <ToastProvider>
          <ModalProvider>{children}</ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
