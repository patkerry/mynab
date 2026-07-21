import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ModalProvider } from "@/components/modal/ModalContext";
import { ToastProvider } from "@/components/toast/ToastContext";

// Inter for body/UI; Space Grotesk as the display face for headings + big figures — gives the app a
// bolder, more modern character than Inter alone. Exposed as CSS vars (see globals.css).
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Assign — Zero-Based Budget",
  description: "A YNAB-style zero-based budgeting app.",
};

// Root layout: just the document shell + app-wide providers. The authenticated app's sidebar lives
// in the (app) route group's layout, so public pages (e.g. /login) render clean and full-screen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>
        <ToastProvider>
          <ModalProvider>{children}</ModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
