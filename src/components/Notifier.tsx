"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Bell, BellRing, MessageCircle, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { playNotification } from "@/lib/client";
import { enablePush, registerServiceWorker } from "@/lib/pushClient";
import type { StaffUser, Ticket } from "@/lib/types";
import { Avatar } from "./Avatar";
import { useBranding } from "./BrandingProvider";

type Toast = { key: number; ticketId: string; title: string; name: string; photo: string | null; body: string };

/**
 * Avisos de novas mensagens em qualquer página:
 * - som sempre;
 * - cartão (toast) quando você NÃO está em Conversas;
 * - notificação do navegador quando a aba/janela não está em foco.
 * Dispara para: cliente novo na fila, nova mensagem de cliente na fila e nos SEUS atendimentos.
 */
export function Notifier({ staff, onWaitingCount }: { staff: StaffUser; onWaitingCount: (n: number) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding } = useBranding();
  const iconRef = useRef("/logo-default.svg");
  iconRef.current = branding.icon || branding.logo || "/logo-default.svg";
  const onConversas = useRef(false);
  onConversas.current = pathname.startsWith("/atendimentos");

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [bannerClosed, setBannerClosed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    registerServiceWorker();
    if (typeof Notification === "undefined") return;
    setPerm(Notification.permission);
    // Já permitido: garante que este aparelho está inscrito para receber push
    if (Notification.permission === "granted") enablePush(false);
    try {
      setBannerClosed(localStorage.getItem("notif-banner-closed-v2") === "1");
    } catch {}
  }, []);

  const dismiss = (key: number) => setToasts((t) => t.filter((x) => x.key !== key));

  const open = useCallback(
    (ticketId: string) => {
      setToasts([]);
      if (onConversas.current) window.dispatchEvent(new CustomEvent("open-ticket", { detail: ticketId }));
      else router.push(`/atendimentos?t=${ticketId}`);
      window.focus();
    },
    [router]
  );

  const notify = useCallback(
    (title: string, t: Ticket) => {
      playNotification();
      const focused = document.hasFocus() && !document.hidden;

      if (!focused && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(title, { body: `${t.contactName}: ${t.lastMessagePreview}`, icon: iconRef.current, tag: t.id });
          n.onclick = () => {
            n.close();
            open(t.id);
          };
        } catch {}
      }

      if (!onConversas.current) {
        const key = ++seq.current;
        setToasts((list) =>
          [
            { key, ticketId: t.id, title, name: t.contactName, photo: t.contactPhoto, body: t.lastMessagePreview },
            ...list.filter((x) => x.ticketId !== t.id),
          ].slice(0, 3)
        );
        setTimeout(() => dismiss(key), 8000);
      }
    },
    [open]
  );

  // Fila: cliente novo e novas mensagens de quem está aguardando.
  const queueSeen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    queueSeen.current = null;
    const q = query(collection(db(), "tickets"), where("status", "==", "waiting"));
    return onSnapshot(q, (snap) => {
      onWaitingCount(snap.size);
      const map = new Map<string, number>();
      let ev: { title: string; t: Ticket } | null = null;
      for (const d of snap.docs) {
        const t = { ...(d.data() as Ticket), id: d.id };
        map.set(d.id, t.lastMessageAt);
        if (!queueSeen.current) continue;
        const before = queueSeen.current.get(d.id);
        if (before === undefined) ev = { title: "Novo cliente na fila", t };
        else if (t.lastMessageAt > before && !t.lastMessageFromMe) ev ??= { title: "Nova mensagem na fila", t };
      }
      if (ev) notify(ev.title, ev.t);
      queueSeen.current = map;
    });
  }, [notify, onWaitingCount]);

  // Meus atendimentos (inclusive "atendendo como"): nova mensagem do cliente.
  const mineSeen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    mineSeen.current = null;
    // Atendimentos abertos em que sou responsável ou participante.
    const q = query(collection(db(), "tickets"), where("status", "==", "open"));
    return onSnapshot(q, (snap) => {
      const map = new Map<string, number>();
      let ev: Ticket | null = null;
      for (const d of snap.docs) {
        const t = { ...(d.data() as Ticket), id: d.id };
        if (t.assignedTo !== staff.uid && !t.participants?.includes(staff.uid)) continue;
        map.set(d.id, t.lastMessageAt);
        const before = mineSeen.current?.get(d.id);
        if (before !== undefined && t.lastMessageAt > before && !t.lastMessageFromMe) ev = t;
      }
      if (ev) notify("Nova mensagem", ev);
      mineSeen.current = map;
    });
  }, [staff.uid, notify]);

  async function enable() {
    if (typeof Notification === "undefined") return;
    playNotification(); // libera o som no navegador
    const r = await enablePush(true);
    setPerm(r === "granted" || r === "error" ? "granted" : r === "unsupported" ? "unsupported" : r);
  }

  function closeBanner() {
    setBannerClosed(true);
    try {
      localStorage.setItem("notif-banner-closed-v2", "1");
    } catch {}
  }

  return (
    <>
      {perm === "default" && !bannerClosed && (
        <div className="fixed bottom-20 left-1/2 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-brand-100 bg-white px-4 py-3 shadow-lg md:bottom-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <BellRing className="h-4 w-4" />
          </div>
          <p className="flex-1 text-sm text-slate-600">Ative as notificações para ser avisado de novas mensagens no celular, mesmo com o app fechado.</p>
          <button onClick={enable} className="btn btn-primary px-3 py-1.5 text-xs">
            Ativar
          </button>
          <button onClick={closeBanner} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" title="Agora não">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.key}
            className="pointer-events-auto flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-xl ring-1 ring-black/5 transition hover:border-brand-200"
            style={{ animation: "toastIn .25s ease-out" }}
            onClick={() => open(t.ticketId)}
          >
            <div className="relative">
              <Avatar name={t.name} photo={t.photo} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-500 text-white ring-2 ring-white">
                <Bell className="h-2.5 w-2.5" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-600">{t.title}</div>
              <div className="truncate text-sm font-semibold text-slate-800">{t.name}</div>
              <div className="line-clamp-2 text-sm text-slate-500">{t.body}</div>
              <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-brand-700">
                <MessageCircle className="h-3.5 w-3.5" /> Abrir conversa
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.key);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
