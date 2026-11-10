import { handler, readJson, requireStaff } from "@/lib/api";
import { startConversation } from "@/lib/tickets";

/** A farmácia inicia uma conversa com um número ou contato salvo. */
export const POST = handler(async (req: Request) => {
  const user = await requireStaff(req);
  const b = await readJson<{ phone?: string; text?: string; name?: string }>(req);
  return startConversation(user, String(b.phone || ""), String(b.text || "").slice(0, 4000), b.name);
});
