import { handler, readJson, requireStaff } from "@/lib/api";
import { requireDevPassword } from "@/lib/devauth";

/** Confere a senha do "Ajuste do desenvolvedor". */
export const POST = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const { password } = await readJson<{ password?: string }>(req);
  await requireDevPassword(password);
  return { ok: true };
});
