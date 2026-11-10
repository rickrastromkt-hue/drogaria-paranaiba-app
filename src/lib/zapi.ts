import "server-only";
import type { MessageType } from "./types";

/** Cliente mínimo da Z-API (https://developer.z-api.io). */

function baseUrl() {
  const id = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  if (!id || !token) throw new Error("ZAPI_INSTANCE_ID / ZAPI_TOKEN não configurados");
  return `https://api.z-api.io/instances/${id}/token/${token}`;
}

async function call<T = unknown>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Client-Token": process.env.ZAPI_CLIENT_TOKEN || "",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`Z-API ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data as T;
}

export interface SendResult {
  zaapId?: string;
  messageId: string;
  id?: string;
}

export const zapi = {
  sendText: (phone: string, message: string) => call<SendResult>("POST", "/send-text", { phone, message }),
  sendImage: (phone: string, image: string, caption?: string) =>
    call<SendResult>("POST", "/send-image", { phone, image, caption }),
  sendVideo: (phone: string, video: string, caption?: string) =>
    call<SendResult>("POST", "/send-video", { phone, video, caption }),
  sendAudio: (phone: string, audio: string) => call<SendResult>("POST", "/send-audio", { phone, audio }),
  sendDocument: (phone: string, document: string, fileName: string) => {
    const ext = (fileName.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    return call<SendResult>("POST", `/send-document/${ext}`, { phone, document, fileName });
  },
  status: () =>
    call<{ connected: boolean; smartphoneConnected?: boolean; error?: string }>("GET", "/status"),
  qrCodeImage: () => call<{ value?: string }>("GET", "/qr-code/image"),
  setReceivedWebhook: (url: string) => call("PUT", "/update-webhook-received", { value: url }),
  setStatusWebhook: (url: string) => call("PUT", "/update-webhook-message-status", { value: url }),
};

/* ------------------------------------------------------------------ */
/* Payload do webhook "Ao receber" (ReceivedCallback)                  */
/* ------------------------------------------------------------------ */

export interface ZapiReceived {
  type: "ReceivedCallback";
  messageId: string;
  phone: string;
  fromMe: boolean;
  fromApi?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  broadcast?: boolean;
  isStatusReply?: boolean;
  momment?: number;
  chatName?: string;
  senderName?: string;
  senderPhoto?: string | null;
  photo?: string | null;
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string; mimeType?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  video?: { videoUrl?: string; caption?: string; mimeType?: string };
  document?: { documentUrl?: string; fileName?: string; title?: string; caption?: string; mimeType?: string };
  sticker?: { stickerUrl?: string; mimeType?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contact?: { displayName?: string; vCard?: string };
  buttonsResponseMessage?: { message?: string };
  listResponseMessage?: { message?: string; title?: string };
  reaction?: unknown;
}

export interface ZapiStatus {
  type: "MessageStatusCallback";
  status: string;
  ids: string[];
  phone: string;
  isGroup?: boolean;
}

export interface ParsedContent {
  type: MessageType;
  text: string;
  mediaUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
}

export function parseContent(p: ZapiReceived): ParsedContent | null {
  const base = { mediaUrl: null, fileName: null, mimeType: null };
  if (p.reaction) return null;
  if (p.text?.message != null) return { ...base, type: "text", text: p.text.message };
  if (p.image?.imageUrl)
    return { type: "image", text: p.image.caption || "", mediaUrl: p.image.imageUrl, fileName: null, mimeType: p.image.mimeType || null };
  if (p.audio?.audioUrl)
    return { type: "audio", text: "", mediaUrl: p.audio.audioUrl, fileName: null, mimeType: p.audio.mimeType || null };
  if (p.video?.videoUrl)
    return { type: "video", text: p.video.caption || "", mediaUrl: p.video.videoUrl, fileName: null, mimeType: p.video.mimeType || null };
  if (p.document?.documentUrl)
    return {
      type: "document",
      text: p.document.caption || "",
      mediaUrl: p.document.documentUrl,
      fileName: p.document.fileName || p.document.title || "documento",
      mimeType: p.document.mimeType || null,
    };
  if (p.sticker?.stickerUrl)
    return { type: "sticker", text: "", mediaUrl: p.sticker.stickerUrl, fileName: null, mimeType: p.sticker.mimeType || null };
  if (p.location?.latitude != null) {
    const url = `https://maps.google.com/?q=${p.location.latitude},${p.location.longitude}`;
    return { ...base, type: "location", text: [p.location.name, p.location.address].filter(Boolean).join(" — "), mediaUrl: url };
  }
  if (p.contact) return { ...base, type: "contact", text: p.contact.displayName || "Contato" };
  if (p.buttonsResponseMessage?.message) return { ...base, type: "text", text: p.buttonsResponseMessage.message };
  if (p.listResponseMessage?.message || p.listResponseMessage?.title)
    return { ...base, type: "text", text: p.listResponseMessage.message || p.listResponseMessage.title || "" };
  return { ...base, type: "other", text: "[mensagem não suportada]" };
}

export function previewOf(type: MessageType, text: string): string {
  const labels: Partial<Record<MessageType, string>> = {
    image: "📷 Imagem",
    audio: "🎤 Áudio",
    video: "🎬 Vídeo",
    document: "📄 Documento",
    sticker: "Figurinha",
    location: "📍 Localização",
    contact: "👤 Contato",
  };
  const label = labels[type];
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (label) return t ? `${label} · ${t}`.slice(0, 120) : label;
  return t.slice(0, 120);
}
