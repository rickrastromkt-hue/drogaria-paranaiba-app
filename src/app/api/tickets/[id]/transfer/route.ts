import { HttpError, handler, readJson, requireActor } from "@/lib/api";
import { transferTicket } from "@/lib/tickets";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor(req);
  const { toUid } = await readJson<{ toUid?: string }>(req);
  if (!toUid) throw new HttpError(400, "Escolha o atendente");
  return transferTicket((await params).id, actor, toUid);
});
