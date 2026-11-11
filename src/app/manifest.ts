import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/brandingServer";

export const dynamic = "force-dynamic";

/** Torna o sistema instalável (Android/iPhone/computador) com o nome e o ícone da empresa. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  return {
    id: "/atendimentos",
    name: `${b.companyName} · Atendimento`,
    short_name: b.companyName.length > 14 ? "Atendimento" : b.companyName,
    description: `Central de atendimento via WhatsApp${b.slogan ? ` — ${b.slogan}` : ""}`,
    start_url: "/atendimentos",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: b.primaryColor,
    lang: "pt-BR",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
