import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClientProviders } from "@/components/ClientProviders";
import "./globals.css";

const displayFont = localFont({
  src: [
    { path: "../../public/fonts/bricolage-bold.ttf", weight: "700" },
    { path: "../../public/fonts/bricolage-extra-bold.ttf", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = localFont({
  src: [
    { path: "../../public/fonts/dm-sans-regular.ttf", weight: "400" },
    { path: "../../public/fonts/dm-sans-bold.ttf", weight: "700" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pho2Booth: A little booth for your best moments",
  description:
    "Good company. A few silly poses. A keepsake to call your own. Capture, style, and download your photos with Pho2Booth, right in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
