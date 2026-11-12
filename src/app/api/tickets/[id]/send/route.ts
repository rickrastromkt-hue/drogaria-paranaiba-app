import { HttpError, handler, readJson, requireActor } from "@/lib/api";
import { agentSend, loadReplyRef } from "@/lib/tickets";
import { MAX_MEDIA_BYTES, parseDataUrl } from "@/lib/mediaStore";
import type { MessageType } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };
type Body = { type?: MessageType; text?: string; mediaUrl?: string; fileName?: string; mimeType?: string; replyToId?: string };

const ALLOWED: MessageType[] = ["text", "image", "audio", "video", "document"];

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const actor = await requireActor(req);
  const b = await readJson<Body>(req);
  const type = b.type || "text";
  if (!ALLOWED.includes(type)) throw new HttpError(400, "Tipo inválido");
  if (b.mediaUrl?.startsWith("data:")) {
    const parsed = parseDataUrl(b.mediaUrl);
    if (!parsed) throw new HttpError(400, "Arquivo inválido");
    if ((parsed.base64.length * 3) / 4 > MAX_MEDIA_BYTES) throw new HttpError(413, "Arquivo grande demais (máx. 3 MB)");
  }
  const ticketId = (await params).id;
  const replyTo = b.replyToId ? await loadReplyRef(ticketId, b.replyToId).catch(() => null) : null;
  const id = await agentSend(ticketId, actor, {
    replyTo,
    type,
    text: String(b.text || "").slice(0, 4000),
    mediaUrl: b.mediaUrl || null,
    fileName: b.fileName || null,
    mimeType: b.mimeType || null,
  });
  return { ok: true, id };
});
