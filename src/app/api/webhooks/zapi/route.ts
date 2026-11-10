import { NextResponse, after } from "next/server";
import { afterReceived, handleReceived, handleStatus, sweepInactive } from "@/lib/tickets";
import type { ZapiReceived, ZapiStatus } from "@/lib/zapi";

export const dynamic = "force-dynamic";

/**
 * Configure na Z-API (Webhooks):
 *   Ao receber        → https://SEU-DOMINIO/api/webhooks/zapi?secret=ZAPI_WEBHOOK_SECRET
 *   Status da mensagem → mesma URL
 */
export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.ZAPI_WEBHOOK_SECRET || secret !== process.env.ZAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (body.type === "ReceivedCallback") {
      const payload = body as ZapiReceived;
      const r = await handleReceived(payload);
      if (r && r.action !== "none") after(() => afterReceived(payload.phone, r).catch((e) => console.error("auto-resposta", e)));
    } else if (body.type === "MessageStatusCallback") {
      await handleStatus(body as ZapiStatus);
    }
  } catch (e) {
    console.error("webhook", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // Aproveita o tráfego do webhook para checar inatividade.
  after(() => sweepInactive().catch((e) => console.error("sweep", e)));
  return NextResponse.json({ ok: true });
}
