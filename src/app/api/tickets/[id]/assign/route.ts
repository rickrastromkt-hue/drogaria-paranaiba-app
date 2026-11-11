import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { adminDb } from "@/lib/firebase-admin";
import { assignTicket } from "@/lib/tickets";
import type { StaffUser } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Pega o atendimento. Administrador pode escolher em nome de quem (asUid). */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireStaff(req);
  const { asUid } = await readJson<{ asUid?: string }>(req);

  let agent: StaffUser = user;
  if (asUid && asUid !== user.uid) {
    if (user.role !== "admin") throw new HttpError(403, "Apenas administradores podem atribuir a outro atendente");
    const data = (await adminDb().doc(`users/${asUid}`).get()).data() as StaffUser | undefined;
    if (!data || !data.active) throw new HttpError(400, "Atendente inválido ou inativo");
    agent = { ...data, uid: asUid };
  }
  return assignTicket((await params).id, agent, user);
});
