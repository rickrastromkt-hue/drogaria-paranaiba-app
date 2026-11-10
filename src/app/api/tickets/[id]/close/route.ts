import { handler, requireStaff } from "@/lib/api";
import { closeTicket } from "@/lib/tickets";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireStaff(req);
  await closeTicket((await params).id, "agent", user);
  return { ok: true };
});
