import { HttpError, handler, readJson, requireActor } from "@/lib/api";
import { adminDb } from "@/lib/firebase-admin";
import { assignTicket } from "@/lib/tickets";
import { canDelegate, type StaffUser } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Pega o atendimento.
 * - Por padrão fica com quem está atendendo (o usuário, ou quem foi escolhido no computador compartilhado).
 * - Administrador pode escolher outro atendente (asUid): quem clicou continua participando.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor(req);
  const { asUid } = await readJson<{ asUid?: string }>(req);

  const by = actor.agent;
  let target: StaffUser = by;
  if (asUid && asUid !== by.uid) {
    if (!canDelegate(actor.real.role)) throw new HttpError(403, "Apenas administradores e supervisores podem atribuir a outro atendente");
    const data = (await adminDb().doc(`users/${asUid}`).get()).data() as StaffUser | undefined;
    if (!data || !data.active) throw new HttpError(400, "Atendente inválido ou inativo");
    target = { ...data, uid: asUid };
  }
  return assignTicket((await params).id, target, by, by.uid !== actor.real.uid ? actor.real.name : null);
});
