import { NextResponse } from "next/server";
import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { getVapidKey, removeToken, saveToken } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Configuração pública para o navegador se inscrever nas notificações. */
export async function GET() {
  return NextResponse.json({ vapidKey: await getVapidKey().catch(() => null) });
}

/** Registra este celular/navegador para receber notificações. */
export const POST = handler(async (req: Request) => {
  const user = await requireStaff(req);
  const { token } = await readJson<{ token?: string }>(req);
  if (!token) throw new HttpError(400, "Token ausente");
  await saveToken(user.uid, token, req.headers.get("user-agent"));
  return { ok: true };
});

/** Para de receber (ao sair do sistema). */
export const DELETE = handler(async (req: Request) => {
  await requireStaff(req);
  const { token } = await readJson<{ token?: string }>(req);
  if (token) await removeToken(token);
  return { ok: true };
});
