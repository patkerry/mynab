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
//
// data-theme="light" pins the app to the light theme regardless of the OS dark preference: the dark
// palette in globals.css is gated on `:root:not([data-theme="light"])`, so this makes it inert. The
// app is intentionally light-only for now (dark mode had un-audited contrast holes); to re-enable
// dark later, remove this attribute AND finish a dark-mode contrast audit first.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <ToastProvider>
          <ModalProvider>{children}</ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
