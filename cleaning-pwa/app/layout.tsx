import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { BUSINESS_NAME } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BUSINESS_NAME, template: `%s · ${BUSINESS_NAME}` },
  description: "Schedules, time tracking and payments for residential cleaning.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: BUSINESS_NAME },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
