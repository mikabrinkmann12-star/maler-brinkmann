import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaHelfer } from "@/components/pwa-helfer";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
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
