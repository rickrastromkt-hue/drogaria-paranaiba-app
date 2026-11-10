import { HttpError, handler, requireStaff } from "@/lib/api";
import { zapi } from "@/lib/zapi";

/** Aponta os webhooks da instância Z-API para este domínio. */
export const POST = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const secret = process.env.ZAPI_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(500, "Defina ZAPI_WEBHOOK_SECRET nas variáveis de ambiente");
  const origin = new URL(req.url).origin;
  if (origin.includes("localhost")) throw new HttpError(400, "Configure o webhook a partir do domínio publicado (Vercel)");
  const url = `${origin}/api/webhooks/zapi?secret=${encodeURIComponent(secret)}`;
  await zapi.setReceivedWebhook(url);
  await zapi.setStatusWebhook(url);
  return { ok: true, url: url.replace(secret, "•••") };
});
