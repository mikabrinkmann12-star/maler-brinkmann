import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { PwaHelfer } from "@/components/pwa-helfer";
import { AKZENT_COOKIE, GLAS_COOKIE, istAkzent } from "@/lib/darstellung";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Maler Brinkmann",
    template: "%s · Maler Brinkmann",
  },
  description: "Handwerker-Software des Maler Betriebs Ralf Brinkmann",
  applicationName: "Maler Brinkmann",
  // iPhone: „Zum Home-Bildschirm“ öffnet die App ohne Safari-Leisten
  appleWebApp: {
    capable: true,
    title: "Maler Brinkmann",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171717",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Farbsatz des Nutzers („Darstellung“) aus einem Cookie, damit beim Laden nichts aufblitzt; die Bereiche gleichen ihn mit der Datenbank ab
  const keks = await cookies();
  const akzentCookie = keks.get(AKZENT_COOKIE)?.value;
  const glas = keks.get(GLAS_COOKIE)?.value === "1" ? "an" : undefined;
  const akzent = istAkzent(akzentCookie) && akzentCookie !== "gruen" ? akzentCookie : undefined;
  return (
    <html
      lang="de"
      data-akzent={akzent}
      data-glas={glas}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaHelfer />
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  );
}
