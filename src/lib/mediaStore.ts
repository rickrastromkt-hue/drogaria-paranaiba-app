import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { adminDb } from "./firebase-admin";

/**
 * Guarda no Firestore uma cópia dos arquivos enviados pela empresa (foto, áudio, documento),
 * sem usar o Firebase Storage. O base64 é dividido em pedaços (< 1 MB por documento).
 *   tickets/{ticketId}/media/{msgId}            → { mime, fileName, chunks, size }
 *   tickets/{ticketId}/media/{msgId}/chunks/{n} → { d: "<base64>" }
 */

const CHUNK = 900_000;
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024; // limite da Vercel (~4,5 MB por requisição) com folga para o base64

function secret() {
  const base = process.env.MEDIA_SECRET || process.env.FIREBASE_PRIVATE_KEY || process.env.ZAPI_WEBHOOK_SECRET || "media";
  return createHash("sha256").update("media:" + base.replace(/\\n/g, "\n").trim()).digest();
}

export function signMedia(ticketId: string, msgId: string) {
  return createHmac("sha256", secret()).update(`${ticketId}/${msgId}`).digest("hex").slice(0, 32);
}

export function verifyMedia(ticketId: string, msgId: string, sig: string) {
  const want = Buffer.from(signMedia(ticketId, msgId));
  const got = Buffer.from(String(sig || ""));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Separa um data URL em { mime, base64 }. */
export function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:([\w.+-]+\/[\w.+-]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl || "");
  return m ? { mime: m[1], base64: m[2] } : null;
}

export async function saveMedia(ticketId: string, msgId: string, dataUrl: string, fileName?: string | null) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("Arquivo inválido");
  const ref = adminDb().doc(`tickets/${ticketId}/media/${msgId}`);
  const parts: string[] = [];
  for (let i = 0; i < parsed.base64.length; i += CHUNK) parts.push(parsed.base64.slice(i, i + CHUNK));
  const batch = adminDb().batch();
  batch.set(ref, { mime: parsed.mime, fileName: fileName || null, chunks: parts.length, size: Math.floor((parsed.base64.length * 3) / 4) });
  parts.forEach((d, n) => batch.set(ref.collection("chunks").doc(String(n).padStart(3, "0")), { d }));
  await batch.commit();
  return `/api/media/file/${ticketId}/${msgId}?s=${signMedia(ticketId, msgId)}`;
}

export async function readMedia(ticketId: string, msgId: string) {
  const ref = adminDb().doc(`tickets/${ticketId}/media/${msgId}`);
  const meta = (await ref.get()).data() as { mime: string; fileName: string | null; chunks: number } | undefined;
  if (!meta) return null;
  const chunks = await ref.collection("chunks").orderBy("__name__").get();
  const base64 = chunks.docs.map((d) => d.data().d as string).join("");
  return { mime: meta.mime, fileName: meta.fileName, data: Buffer.from(base64, "base64") };
}
