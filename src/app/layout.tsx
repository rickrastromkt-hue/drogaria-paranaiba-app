import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { BrandingProvider, brandingBootScript } from "@/components/BrandingProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Central de Atendimento",
  description: "Central de atendimento via WhatsApp",
  icons: { icon: "/logo-default.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: brandingBootScript }} />
      </head>
      <body>
        <BrandingProvider>
          <AuthProvider>{children}</AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
