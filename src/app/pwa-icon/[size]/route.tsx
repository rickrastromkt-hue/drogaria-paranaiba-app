import { ImageResponse } from "next/og";
import { getBranding } from "@/lib/brandingServer";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ size: string }> };

/**
 * Ícones do app instalado (Android/PWA), gerados a partir do ícone da empresa.
 *   /pwa-icon/192        /pwa-icon/512        /pwa-icon/512-maskable (com margem de segurança)
 */
export async function GET(_req: Request, { params }: Ctx) {
  const raw = (await params).size;
  const maskable = raw.endsWith("-maskable");
  const size = Math.max(48, Math.min(1024, parseInt(raw, 10) || 512));
  const b = await getBranding();
  const src = b.icon || b.logo;
  const pad = maskable ? 0.2 : 0.08;
  const inner = Math.round(size * (1 - pad * 2));

  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
        ) : (
          <div
            style={{
              width: inner,
              height: inner,
              borderRadius: inner * 0.28,
              background: b.primaryColor,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: inner * 0.5,
              fontWeight: 700,
            }}
          >
            {b.companyName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } }
  );
}
