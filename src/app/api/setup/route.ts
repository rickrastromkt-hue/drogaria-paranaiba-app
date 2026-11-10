import { HttpError, handler, readJson } from "@/lib/api";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

async function hasUsers() {
  const snap = await adminDb().collection("users").limit(1).get();
  return !snap.empty;
}

/** Indica se o sistema ainda precisa do primeiro administrador. */
export const GET = handler(async () => ({ needed: !(await hasUsers()) }));

/** Cria o primeiro administrador. Só funciona enquanto não houver nenhum usuário. */
export const POST = handler(async (req: Request) => {
  if (await hasUsers()) throw new HttpError(403, "O sistema já foi configurado");
  const b = await readJson<{ name?: string; email?: string; password?: string }>(req);
  const name = (b.name || "").trim();
  const email = (b.email || "").trim().toLowerCase();
  if (!name || !email || !b.password || b.password.length < 6)
    throw new HttpError(400, "Preencha nome, e-mail e senha (mín. 6 caracteres)");
  const { uid } = await adminAuth().createUser({ email, password: b.password, displayName: name });
  await adminDb().doc(`users/${uid}`).set({ name, email, role: "admin", active: true, createdAt: Date.now() });
  return { ok: true };
});
