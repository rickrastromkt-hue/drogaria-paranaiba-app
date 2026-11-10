import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { Role, StaffUser } from "@/lib/types";

type Body = { name?: string; email?: string; password?: string; role?: Role };

export const POST = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const b = await readJson<Body>(req);
  const name = (b.name || "").trim();
  const email = (b.email || "").trim().toLowerCase();
  const role: Role = b.role === "admin" ? "admin" : "agent";
  if (!name || !email) throw new HttpError(400, "Informe nome e e-mail");
  if (!b.password || b.password.length < 6) throw new HttpError(400, "A senha precisa ter ao menos 6 caracteres");

  let uid: string;
  try {
    uid = (await adminAuth().createUser({ email, password: b.password, displayName: name })).uid;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") throw new HttpError(409, "Já existe um usuário com este e-mail");
    if (code === "auth/invalid-email") throw new HttpError(400, "E-mail inválido");
    throw e;
  }
  const user: Omit<StaffUser, "uid"> = { name, email, role, active: true, createdAt: Date.now() };
  await adminDb().doc(`users/${uid}`).set(user);
  return { ok: true, uid };
});
