import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Newsreader } from "next/font/google";
import { RegisterServiceWorker } from "@/features/pwa/register-service-worker";
import "./globals.css";
import "./mobile-navigation.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });
const jetBrainsMono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "My Brain", template: "%s · My Brain" },
  description: "Seu contexto, organizado e atento.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brain-icon.svg", apple: "/brain-icon.svg" },
};
export const viewport: Viewport = { themeColor: "#14233b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={`${manrope.variable} ${newsreader.variable} ${jetBrainsMono.variable} h-full antialiased`}><body className="min-h-full flex flex-col"><RegisterServiceWorker/>{children}</body></html>;
}
