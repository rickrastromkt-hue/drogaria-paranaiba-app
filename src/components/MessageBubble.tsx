"use client";

import { Bot, Check, CheckCheck, Clock, FileText, MapPin, Smartphone, User, X } from "lucide-react";
import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/client";

function StatusIcon({ status }: { status?: Message["status"] }) {
  if (status === "read" || status === "played") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === "received") return <CheckCheck className="h-3.5 w-3.5" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5" />;
  if (status === "failed") return <X className="h-3.5 w-3.5 text-rose-500" />;
  return <Clock className="h-3 w-3" />;
}

function Media({ m }: { m: Message }) {
  if (!m.mediaUrl) return null;
  switch (m.type) {
    case "image":
      return (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.mediaUrl} alt="" className="mb-1 max-h-72 rounded-lg object-cover" />
        </a>
      );
    case "sticker":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={m.mediaUrl} alt="figurinha" className="h-28 w-28 object-contain" />;
    case "audio":
      return <audio controls src={m.mediaUrl} className="h-10 w-64 max-w-full" />;
    case "video":
      return <video controls src={m.mediaUrl} className="mb-1 max-h-72 rounded-lg" />;
    case "document":
      return (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm hover:bg-black/10">
          <FileText className="h-5 w-5 shrink-0 text-brand-700" />
          <span className="truncate">{m.fileName || "Documento"}</span>
        </a>
      );
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

export function MessageBubble({ m }: { m: Message }) {
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
      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {m.agentName}</span>
    ) : null;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? m.source === "bot"
              ? "rounded-br-md bg-sky-50 text-slate-700"
              : "rounded-br-md bg-brand-100/80 text-slate-800"
            : "rounded-bl-md bg-white text-slate-800"
        }`}
      >
        {tag && <div className="mb-0.5 text-[11px] font-medium text-slate-500">{tag}</div>}
        <Media m={m} />
        {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400">
          {formatTime(m.createdAt)}
          {mine && <StatusIcon status={m.status} />}
        </div>
      </div>
    </div>
  );
}
