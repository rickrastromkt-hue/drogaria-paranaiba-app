import { handler, requireActor } from "@/lib/api";
import { closeTicket } from "@/lib/tickets";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor(req);
  await closeTicket((await params).id, "agent", actor);
  return { ok: true };
});
