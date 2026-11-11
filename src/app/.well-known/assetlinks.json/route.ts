import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Digital Asset Links: prova para o Android que o APK (TWA) pertence a este site,
 * para o app abrir em tela cheia, sem a barra do navegador.
 * Configurado em Firestore settings/android → { packageName, sha256: ["AA:BB:..."] }
 * (ou pelas variáveis ANDROID_PACKAGE_NAME e ANDROID_SHA256, separadas por vírgula).
 */
export async function GET() {
  let packageName = process.env.ANDROID_PACKAGE_NAME || "";
  let sha: string[] = (process.env.ANDROID_SHA256 || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!packageName || !sha.length) {
    const d = (await adminDb().doc("settings/android").get().catch(() => null))?.data();
    packageName ||= (d?.packageName as string) || "";
    if (!sha.length) sha = ((d?.sha256 as string[]) || []).filter(Boolean);
  }
  const body = packageName && sha.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: sha } }]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
