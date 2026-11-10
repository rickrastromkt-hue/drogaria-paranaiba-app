import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_BRANDING, mergeBranding, type Branding } from "@/lib/branding";
import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { requireDevPassword } from "@/lib/devauth";

export const dynamic = "force-dynamic";

/** Identidade visual pública (usada até na tela de login, antes de entrar). */
export async function GET() {
  try {
    const snap = await adminDb().doc("settings/branding").get();
    return NextResponse.json(mergeBranding(snap.data() as Partial<Branding> | undefined), {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json(mergeBranding(null));
  }
}

/** Salva a identidade visual — só administrador COM a senha do desenvolvedor. */
export const POST = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const b = await readJson<Partial<Branding> & { password?: string }>(req);
  await requireDevPassword(b.password);

  const color = (v: unknown, fb: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fb);
  const image = (v: unknown) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !v.startsWith("data:image/") || v.length > 400_000) throw new HttpError(400, "Imagem inválida ou grande demais");
    return v;
  };
  const companyName = String(b.companyName || "").trim().slice(0, 80);
  if (!companyName) throw new HttpError(400, "Informe o nome da empresa");

  const data: Branding = {
    companyName,
    slogan: String(b.slogan || "").trim().slice(0, 120),
    logo: image(b.logo),
    icon: image(b.icon),
    primaryColor: color(b.primaryColor, DEFAULT_BRANDING.primaryColor),
    accentColor: color(b.accentColor, DEFAULT_BRANDING.accentColor),
  };
  await adminDb().doc("settings/branding").set(data);
  return { ok: true };
});
