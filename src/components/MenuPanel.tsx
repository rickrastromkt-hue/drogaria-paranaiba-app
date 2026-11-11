"use client";

import { useState } from "react";
import { ArrowLeft, ListChecks, Loader2, MoveRight } from "lucide-react";
import { api, formatPhone, formatTime } from "@/lib/client";
import type { Contact, Message } from "@/lib/types";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";

export type MenuContact = Contact & {
  waName?: string | null;
  menu?: { pendingSince?: number | null; pending?: (Omit<Message, "id" | "source"> & { id: string })[] };
};

/** Cliente que recebeu o menu e ainda não escolheu 1 ou 2. */
export function MenuPanel({ contact, onBack, onMoved }: { contact: MenuContact; onBack: () => void; onMoved: (ticketId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = contact.menu?.pending || [];

  async function move() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ticketId: string }>("/api/contacts/to-queue", { phone: contact.phone });
      onMoved(r.ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2.5 border-b border-slate-200/70 bg-white px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <button onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" title="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={contact.name} photo={contact.photo} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-800">{contact.name}</div>
          <div className="text-xs text-slate-500">{formatPhone(contact.phone)}</div>
        </div>
        <span className="hidden items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 sm:flex">
          <ListChecks className="h-3.5 w-3.5" /> No menu
        </span>
      </header>

      <div className="chat-bg min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 sm:px-8 sm:py-4">
        <div className="mb-2 flex justify-center">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow-sm">
            Recebeu o menu{contact.menu?.pendingSince ? ` às ${formatTime(contact.menu.pendingSince)}` : ""} e ainda não escolheu uma opção
          </span>
        </div>
        {pending.map((m) => (
          <MessageBubble key={m.id} m={{ ...m, source: "customer" } as Message} />
        ))}
      </div>

      <div className="pb-safe flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 pt-3">
        <span className="text-sm text-slate-500">{error || "Quer atender agora? Mande para a fila."}</span>
        <button onClick={move} disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveRight className="h-4 w-4" />} Mover para a fila
        </button>
      </div>
    </div>
  );
}
