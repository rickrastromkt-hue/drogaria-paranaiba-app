import { handler, readJson, requireActor } from "@/lib/api";
import { startConversation } from "@/lib/tickets";

/** A empresa inicia uma conversa com um número ou contato salvo. */
export const POST = handler(async (req: Request) => {
  const actor = await requireActor(req);
  const b = await readJson<{ phone?: string; text?: string; name?: string }>(req);
  return startConversation(actor, String(b.phone || ""), String(b.text || "").slice(0, 4000), b.name);
});
