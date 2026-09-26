import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.website),
  title: {
    default: "BLACKBOX QUIZ",
    template: "%s | BLACKBOX QUIZ",
  },
  description: `${BRAND.tagline}. ${BRAND.app} is the live two-team academic competition platform for schools, universities, and organizations. Contact: ${BRAND.email}`,
  applicationName: "BLACKBOX QUIZ",
  authors: [{ name: BRAND.company, url: BRAND.website }],
  creator: BRAND.company,
  publisher: BRAND.company,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: ["/favicon.ico", "/icon.png"],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BLACKBOX QUIZ",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
