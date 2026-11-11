"use client";

import { useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatDateTime } from "@/lib/client";
import type { Message, Ticket } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

/** "Ver atendimentos anteriores": mostra as conversas passadas do mesmo cliente, acima da atual. */
export function PreviousTickets({ phone, currentId }: { phone: string; currentId: string }) {
  const [list, setList] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Record<string, Message[] | "loading">>({});

  async function load() {
    setLoading(true);
    try {
      const s = await getDocs(query(collection(db(), "tickets"), where("phone", "==", phone)));
      setList(
        s.docs
          .map((d) => ({ ...(d.data() as Ticket), id: d.id }))
          .filter((t) => t.id !== currentId)
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggle(t: Ticket) {
    if (open[t.id]) {
      const n = { ...open };
      delete n[t.id];
      return setOpen(n);
    }
    setOpen((o) => ({ ...o, [t.id]: "loading" }));
    const s = await getDocs(query(collection(db(), "tickets", t.id, "messages"), orderBy("createdAt")));
    setOpen((o) => ({ ...o, [t.id]: s.docs.map((d) => ({ ...(d.data() as Message), id: d.id })) }));
  }

  if (!list)
    return (
      <div className="flex justify-center pb-2">
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:text-brand-700"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Ver atendimentos anteriores
        </button>
      </div>
    );

  if (!list.length)
    return <p className="pb-2 text-center text-xs text-slate-400">Nenhum atendimento anterior com este cliente.</p>;

  return (
    <div className="space-y-2 pb-3">
      {list.map((t) => {
        const msgs = open[t.id];
        return (
          <div key={t.id} className="overflow-hidden rounded-xl border border-slate-200/70 bg-white/80">
            <button onClick={() => toggle(t)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white">
              {msgs ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              <span className="font-semibold text-slate-700">#{t.protocol}</span>
              <span className="text-slate-400">{formatDateTime(t.createdAt)}</span>
              <span className="ml-auto truncate text-slate-500">
                {t.status !== "closed" ? "em andamento" : t.closedBy === "finance" ? "Financeiro" : t.assignedName ? `com ${t.assignedName}` : "encerrado"}
              </span>
            </button>
            {msgs === "loading" && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              </div>
            )}
            {Array.isArray(msgs) && (
              <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 p-3 opacity-90">
                {msgs.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
                {!msgs.length && <p className="text-center text-xs text-slate-400">Sem mensagens.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
