import { NextResponse } from "next/server";
import { readMedia, verifyMedia } from "@/lib/mediaStore";

type Ctx = { params: Promise<{ ticket: string; msg: string }> };

/** Entrega um arquivo guardado no Firestore. O link é assinado (não dá para adivinhar). */
export async function GET(req: Request, { params }: Ctx) {
  const { ticket, msg } = await params;
  const url = new URL(req.url);
  if (!verifyMedia(ticket, msg, url.searchParams.get("s") || "")) return NextResponse.json({ error: "not found" }, { status: 404 });
  const m = await readMedia(ticket, msg);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = (m.fileName || "arquivo").replace(/["\r\n]/g, "");
  const disposition = url.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(m.data), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.data.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
