"use client";

import { useRef, useState } from "react";
import { Bot, Check, CheckCheck, Clock, Loader2, MapPin, Reply, RotateCcw, Smartphone, User, X } from "lucide-react";
import { AudioPlayer, DocumentMessage, ImageMessage } from "./Media";
import { WhatsappText } from "./WhatsappText";
import type { Message, ReplyRef } from "@/lib/types";
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

/** Bloco da mensagem citada (dentro da bolha ou acima do campo de texto). */
export function QuoteBlock({ q, onClick, compact }: { q: ReplyRef; onClick?: () => void; compact?: boolean }) {
  const isCustomer = q.source === "customer";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full min-w-0 rounded-lg border-l-4 bg-black/[0.05] px-2.5 py-1.5 text-left transition hover:bg-black/[0.08] ${
        isCustomer ? "border-accent-500" : "border-brand-500"
      } ${compact ? "" : "mb-1"}`}
    >
      <div className={`truncate text-[11px] font-semibold ${isCustomer ? "text-accent-600" : "text-brand-700"}`}>{q.author}</div>
      <div className="line-clamp-2 text-xs text-slate-600">{q.text || "Mensagem"}</div>
    </button>
  );
}

/** Rola até a mensagem citada e destaca por um instante. */
function jumpTo(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("msg-flash");
  setTimeout(() => el.classList.remove("msg-flash"), 1400);
}

const SWIPE_TRIGGER = 56;

export function MessageBubble({ m, sending, onReply }: { m: Message; sending?: Sending; onReply?: (m: Message) => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; active: boolean } | null>(null);
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

  // Arrastar para a direita (toque) = responder, como no WhatsApp
  const canSwipe = !!onReply && !sending;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canSwipe || e.pointerType !== "touch") return;
    start.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (start.current = null); // rolagem vertical
      if (mx > 10) s.active = true;
    }
    if (s.active) setDx(Math.max(0, Math.min(90, mx)));
  };
  const onPointerEnd = () => {
    if (start.current?.active && dx >= SWIPE_TRIGGER) {
      onReply?.(m);
      if (navigator.vibrate) navigator.vibrate(15);
    }
    start.current = null;
    setDx(0);
  };

  return (
    <div
      id={`msg-${m.id}`}
      className={`group relative flex items-center gap-1 rounded-xl ${mine ? "justify-end" : "justify-start"}`}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {canSwipe && (
        <span
          className="pointer-events-none absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-500 shadow"
          style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER), transform: `translateY(-50%) scale(${0.6 + Math.min(1, dx / SWIPE_TRIGGER) * 0.4})` }}
        >
          <Reply className="h-4 w-4" />
        </span>
      )}
      {canSwipe && mine && (
        <button
          onClick={() => onReply?.(m)}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-400 opacity-0 shadow-sm transition hover:text-brand-700 group-hover:opacity-100 md:flex"
          title="Responder"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        style={dx ? { transform: `translateX(${dx}px)` } : { transition: "transform .18s ease-out" }}
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${sending?.error ? "ring-1 ring-accent-200" : ""} ${
          mine
            ? m.source === "bot"
              ? "rounded-br-md bg-slate-100 text-slate-700"
              : "rounded-br-md bg-brand-100/80 text-slate-800"
            : "rounded-bl-md bg-white text-slate-800"
        }`}
      >
        {tag && <div className="mb-0.5 text-[11px] font-medium text-slate-500">{tag}</div>}
        {m.replyTo && <QuoteBlock q={m.replyTo} onClick={() => jumpTo(m.replyTo!.id)} />}
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
      {canSwipe && !mine && (
        <button
          onClick={() => onReply?.(m)}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-400 opacity-0 shadow-sm transition hover:text-brand-700 group-hover:opacity-100 md:flex"
          title="Responder"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
