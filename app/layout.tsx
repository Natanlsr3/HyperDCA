import type { Metadata } from "next";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HyperDCA",
    template: "%s | HyperDCA",
  },
  description: "Themed HyperLiquid perp baskets with automated DCA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          <main className="app-main">
            <div className="app-content">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
