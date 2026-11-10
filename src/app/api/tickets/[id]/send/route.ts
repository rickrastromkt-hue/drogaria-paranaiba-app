import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { agentSend } from "@/lib/tickets";
import type { MessageType } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
type Body = { type?: MessageType; text?: string; mediaUrl?: string; fileName?: string; mimeType?: string };

const ALLOWED: MessageType[] = ["text", "image", "audio", "video", "document"];

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireStaff(req);
  const b = await readJson<Body>(req);
  const type = b.type || "text";
  if (!ALLOWED.includes(type)) throw new HttpError(400, "Tipo inválido");
  const id = await agentSend((await params).id, user, {
    type,
    text: String(b.text || "").slice(0, 4000),
    mediaUrl: b.mediaUrl || null,
    fileName: b.fileName || null,
    mimeType: b.mimeType || null,
  });
  return { ok: true, id };
});
