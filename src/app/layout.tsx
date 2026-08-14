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
 * **IBM Plex Sans and Newsreader are variable fonts and are loaded without a
 * `weight`**, which is what covers their whole range. An earlier version of this
 * file pinned Plex Sans to 400/500/600 on the stated grounds that neither Plex
 * family is variable. That was wrong — `next/dist/compiled/@next/font/dist/
 * google/font-data.json` lists `variable` for Plex Sans and for Newsreader — and
 * the cost was not theoretical: **85 declarations across the stylesheets ask for
 * 650, 700, 750 or 800**, none of which existed in a loaded face, so every one
 * of them was being synthesised by smearing the 600. Faux bold is the thing a
 * type system exists to prevent.
 *
 * IBM Plex Mono genuinely is not variable, so it enumerates. It carries 700
 * because the reminder eyebrows ask for it and the mono face is the one place
 * where a missing weight cannot be covered by a neighbouring one.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
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
