import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Role } from "@/lib/types";

type Ctx = { params: Promise<{ uid: string }> };
type Body = { name?: string; role?: Role; active?: boolean; password?: string };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const me = await requireStaff(req, { admin: true });
  const { uid } = await params;
  const b = await readJson<Body>(req);
  if (uid === me.uid && (b.active === false || b.role === "agent"))
    throw new HttpError(400, "Você não pode remover seu próprio acesso de administrador");

  const update: Record<string, unknown> = {};
  const authUpdate: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) {
    update.name = b.name.trim();
    authUpdate.displayName = b.name.trim();
  }
  if (b.role === "admin" || b.role === "agent") update.role = b.role;
  if (typeof b.active === "boolean") {
    update.active = b.active;
    authUpdate.disabled = !b.active;
  }
  if (b.password) {
    if (b.password.length < 6) throw new HttpError(400, "A senha precisa ter ao menos 6 caracteres");
    authUpdate.password = b.password;
  }
  if (Object.keys(authUpdate).length) await adminAuth().updateUser(uid, authUpdate);
  if (b.active === false) await adminAuth().revokeRefreshTokens(uid);
  if (Object.keys(update).length) await adminDb().doc(`users/${uid}`).update(update);
  return { ok: true };
});
