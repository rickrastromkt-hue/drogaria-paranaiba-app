"use client";

import { Bot, Check, CheckCheck, Clock, Loader2, MapPin, RotateCcw, Smartphone, User, X } from "lucide-react";
import { AudioPlayer, DocumentMessage, ImageMessage } from "./Media";
import { WhatsappText } from "./WhatsappText";
import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/client";

function StatusIcon({ status }: { status?: Message["status"] }) {
  if (status === "read" || status === "played") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === "received") return <CheckCheck className="h-3.5 w-3.5" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5" />;
  if (status === "failed") return <X className="h-3.5 w-3.5 text-rose-500" />;
  return <Clock className="h-3 w-3" />;
}

function Media({ m, mine }: { m: Message; mine: boolean }) {
  if (!m.mediaUrl) return null;
  switch (m.type) {
    case "image":
      return <ImageMessage url={m.mediaUrl} caption={m.text} />;
    case "sticker":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={m.mediaUrl} alt="figurinha" className="h-28 w-28 object-contain" />;
    case "audio":
      return <AudioPlayer url={m.mediaUrl} mine={mine} />;
    case "video":
      return <video controls src={m.mediaUrl} className="mb-1 max-h-72 rounded-lg" />;
    case "document":
      return <DocumentMessage url={m.mediaUrl} fileName={m.fileName} />;
    case "location":
      return (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 text-sm text-brand-700 hover:underline">
          <MapPin className="h-4 w-4" /> Ver localização
        </a>
      );
    default:
      return null;
  }
}

export type Sending = { progress?: number; error?: string; onRetry?: () => void; onDiscard?: () => void };

/** Foto/vídeo ainda subindo: prévia local com carregador e porcentagem (como no WhatsApp). */
function UploadingMedia({ m, sending }: { m: Message; sending: Sending }) {
  const pct = Math.max(0, Math.min(100, sending.progress ?? 0));
  const R = 18;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mb-1 overflow-hidden rounded-lg bg-black/5">
      {m.type === "video" ? (
        <video src={m.mediaUrl!} muted playsInline className="block max-h-[420px] max-w-full" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.mediaUrl!} alt="" className="block h-auto max-h-[420px] w-auto max-w-full min-w-[120px] object-contain" />
      )}
      {!sending.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/45">
            <svg viewBox="0 0 44 44" className="absolute inset-0 h-12 w-12 -rotate-90">
              <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
              {pct > 0 ? (
                <circle cx="22" cy="22" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-200" />
              ) : (
                <circle cx="22" cy="22" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * 0.25} ${C}`} className="origin-center animate-spin" />
              )}
            </svg>
            <span className="text-[10px] font-semibold text-white">{pct > 0 && pct < 100 ? `${pct}%` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ m, sending }: { m: Message; sending?: Sending }) {
  if (m.source === "system")
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow-sm">
          {m.text} · {formatTime(m.createdAt)}
        </span>
      </div>
    );

  const mine = m.source !== "customer";
  const tag =
    m.source === "bot" ? (
      <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> Automática</span>
    ) : m.source === "phone" ? (
      <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Pelo celular</span>
    ) : m.source === "agent" && m.agentName ? (
      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {m.agentName}
        {m.signedAs && m.signedAs !== m.agentName ? ` (como ${m.signedAs})` : ""}
        {m.viaName ? <span className="font-normal text-slate-400"> · via {m.viaName}</span> : null}</span>
    ) : null;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${sending?.error ? "ring-1 ring-accent-200" : ""} ${
          mine
            ? m.source === "bot"
              ? "rounded-br-md bg-slate-100 text-slate-700"
              : "rounded-br-md bg-brand-100/80 text-slate-800"
            : "rounded-bl-md bg-white text-slate-800"
        }`}
      >
        {tag && <div className="mb-0.5 text-[11px] font-medium text-slate-500">{tag}</div>}
        {sending && (m.type === "image" || m.type === "video") && m.mediaUrl ? <UploadingMedia m={m} sending={sending} /> : <Media m={m} mine={mine} />}
        {m.text && <WhatsappText text={m.text} />}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400">
          {formatTime(m.createdAt)}
          {mine && (sending && !sending.error ? <Loader2 className="h-3 w-3 animate-spin" /> : <StatusIcon status={m.status} />)}
        </div>
        {sending?.error && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-black/5 pt-1 text-[11px]">
            <span className="text-accent-600">Falhou: {sending.error}</span>
            <button onClick={sending.onRetry} className="flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              <RotateCcw className="h-3 w-3" /> Tentar de novo
            </button>
            <button onClick={sending.onDiscard} className="text-slate-500 hover:underline">
              Descartar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
