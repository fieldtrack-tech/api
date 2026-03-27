import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";

export const dynamic = "force-dynamic";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FieldTrack",
    template: "%s — FieldTrack",
  },
  description: "Field workforce tracking and management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dark class as default — brand default is dark (matches logo)
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
