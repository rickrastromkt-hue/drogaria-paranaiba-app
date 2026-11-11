import { HttpError, handler, readJson, requireActor } from "@/lib/api";
import { moveMenuContactToQueue } from "@/lib/tickets";

/** Move um cliente que está no menu (sem escolher opção) para a Fila. */
export const POST = handler(async (req: Request) => {
  const actor = await requireActor(req);
  const { phone } = await readJson<{ phone?: string }>(req);
  if (!phone) throw new HttpError(400, "Informe o contato");
  const ticketId = await moveMenuContactToQueue(String(phone), actor.agent);
  return { ok: true, ticketId };
});
