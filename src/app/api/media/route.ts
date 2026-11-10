import { HttpError, readJson, requireStaff } from "@/lib/api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Só baixa de onde a Z-API / Firebase guardam mídias (evita virar proxy aberto).
const ALLOWED = [
  "z-api.io",
  "amazonaws.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "whatsapp.net",
  "digitaloceanspaces.com",
];

/** Proxy autenticado para forçar o download de arquivos de outros domínios. */
export async function POST(req: Request) {
  try {
    await requireStaff(req);
    const { url, fileName } = await readJson<{ url?: string; fileName?: string }>(req);
    let u: URL;
    try {
      u = new URL(String(url));
    } catch {
      throw new HttpError(400, "URL inválida");
    }
    if (u.protocol !== "https:" || !ALLOWED.some((h) => u.hostname === h || u.hostname.endsWith("." + h)))
      throw new HttpError(400, "Origem não permitida");
    const res = await fetch(u, { cache: "no-store" });
    if (!res.ok || !res.body) throw new HttpError(502, "Não foi possível baixar o arquivo");
    const name = (fileName || u.pathname.split("/").pop() || "arquivo").replace(/["\r\n]/g, "");
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status });
  }
}
