"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Bot, Loader2, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatDateTime, formatPhone } from "@/lib/client";
import type { Ticket } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { ChatPanel } from "@/components/ChatPanel";

export default function HistoricoPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [max, setMax] = useState(100);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Ticket | null>(null);

  useEffect(() => {
    const q = query(collection(db(), "tickets"), orderBy("closedAt", "desc"), limit(max));
    return onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ ...(d.data() as Ticket), id: d.id })).filter((t) => t.status === "closed"));
      setLoading(false);
    });
  }, [max]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term
        ? tickets.filter(
            (t) =>
              t.contactName.toLowerCase().includes(term) ||
              (t.assignedName || "").toLowerCase().includes(term) ||
              t.phone.includes(term.replace(/\D/g, "") || "§") ||
              String(t.protocol) === term
          )
        : tickets,
    [tickets, term]
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Histórico</h1>
            <p className="text-sm text-slate-500">Atendimentos encerrados</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Cliente, atendente, telefone ou protocolo" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Nenhum atendimento encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Protocolo</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Atendente</th>
                  <th className="px-4 py-3 font-medium">Encerrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <tr key={t.id} onClick={() => setOpen(t)} className="cursor-pointer hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.contactName} photo={t.contactPhoto} size={34} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{t.contactName}</div>
                          <div className="text-xs text-slate-400">{formatPhone(t.phone)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 sm:table-cell">#{t.protocol}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{t.assignedName || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-600">{t.closedAt ? formatDateTime(t.closedAt) : "—"}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        {t.closedBy === "inactivity" ? (<><Bot className="h-3 w-3" /> Ausência do cliente</>) : t.closedByName ? `por ${t.closedByName}` : ""}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {tickets.length >= max && (
          <div className="mt-4 flex justify-center">
            <button className="btn btn-soft" onClick={() => setMax((m) => m + 100)}>Carregar mais</button>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]" onClick={() => setOpen(null)}>
          <div className="relative h-full w-full max-w-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(null)} className="absolute right-3 top-3.5 z-10 rounded-lg bg-white p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            <ChatPanel ticket={open} readOnly />
          </div>
        </div>
      )}
    </div>
  );
}
