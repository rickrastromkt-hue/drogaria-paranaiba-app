import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { mergeBranding, type Branding } from "@/lib/branding";

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
