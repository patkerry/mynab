import type { Metadata } from "next";
import "./globals.css";
import { ModalProvider } from "@/components/modal/ModalContext";
import { ToastProvider } from "@/components/toast/ToastContext";

export const metadata: Metadata = {
  title: "Assign — Zero-Based Budget",
  description: "A YNAB-style zero-based budgeting app.",
};

// Root layout: just the document shell + app-wide providers. The authenticated app's sidebar lives
// in the (app) route group's layout, so public pages (e.g. /login) render clean and full-screen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <ModalProvider>{children}</ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
