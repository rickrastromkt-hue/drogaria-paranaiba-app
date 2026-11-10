import { handler, requireStaff } from "@/lib/api";
import { assignTicket } from "@/lib/tickets";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireStaff(req);
  return assignTicket((await params).id, user);
});
