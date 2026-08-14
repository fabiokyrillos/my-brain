import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { RegisterServiceWorker } from "@/features/pwa/register-service-worker";
import "./globals.css";
import "./mobile-navigation.css";
import "./pagination.css";

/*
 * Papel e Console's three families (ADR-114).
 *
 * Newsreader stays — it is what is already recognisable in the product, and it
 * carries every piece of the user's own content. Manrope and JetBrains Mono are
 * replaced by the IBM Plex pair: Plex Sans for the interface, Plex Mono for
 * metadata (time, cost, shortcut, eyebrow).
 *
 * Newsreader is a variable font, so it takes a weight *range*. Neither IBM Plex
 * family is variable on Google Fonts, so each must enumerate the weights the
 * design system actually uses — `next/font` errors on a missing `weight` for a
 * static family, and shipping a weight the tokens never reference is dead
 * payload on every page.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "My Brain", template: "%s · My Brain" },
  description: "Seu contexto, organizado e atento.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brain-icon.svg", apple: "/brain-icon.svg" },
};

export const viewport: Viewport = {
  /*
   * Two entries, so the browser chrome matches the canvas the user is actually
   * looking at. A single `themeColor` string would paint the light canvas
   * behind a dark page — the seam that makes a themed PWA look broken at the
   * status bar. The values are `--background-canvas` in each theme; they are
   * literals because `viewport` is serialised at build time and cannot read CSS.
   */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${plexSans.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
