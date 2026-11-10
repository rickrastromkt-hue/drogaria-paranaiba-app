import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { deleteTickets } from "@/lib/tickets";

/** Exclui atendimentos permanentemente (somente administradores). */
export const POST = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const { ids } = await readJson<{ ids?: string[] }>(req);
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x) => typeof x === "string" && x))] : [];
  if (!list.length) throw new HttpError(400, "Nenhum atendimento selecionado");
  if (list.length > 200) throw new HttpError(400, "Selecione no máximo 200 por vez");
  const deleted = await deleteTickets(list);
  return { ok: true, deleted };
});
