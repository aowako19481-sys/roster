import type { Metadata, Viewport } from "next";
import { geist, geistMono, instrumentSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Roster", template: "%s · Roster" },
  description: "Agent onboarding and commission payroll for real estate brokerages.",
  robots: { index: false, follow: false },
};

// Every page is rendered per request. The security policy in src/proxy.ts
// issues a fresh nonce each time, which a pre-built static page cannot carry.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#B6B7B9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
