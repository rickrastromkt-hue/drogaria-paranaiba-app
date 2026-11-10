"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Bot, Loader2, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { api, formatDateTime, formatPhone } from "@/lib/client";
import { useAuth } from "@/components/AuthProvider";
import type { Ticket } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { ChatPanel } from "@/components/ChatPanel";
import { Credit } from "@/components/Credit";

export default function HistoricoPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [max, setMax] = useState(100);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Ticket | null>(null);
  const { staff } = useAuth();
  const isAdmin = staff?.role === "admin";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Permite abrir já filtrado: /historico?q=5534999999999
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
  }, []);

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
              String(t.protocol).replace(/\D/g, "").includes(term.replace(/\D/g, "") || "§")
          )
        : tickets,
    [tickets, term]
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((t) => t.id)));

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} atendimento(s)?\n\nTodas as mensagens e arquivos serão apagados e isso NÃO pode ser desfeito.`)) return;
    setDeleting(true);
    try {
      await api("/api/tickets/delete", { ids });
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col p-4 sm:p-6">
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

        {isAdmin && selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-accent-100 bg-accent-50 px-4 py-2.5 text-sm">
            <span className="text-accent-700">{selected.size} selecionado(s)</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost px-3 py-1.5" onClick={() => setSelected(new Set())}>Cancelar</button>
              <button className="btn btn-danger px-3 py-1.5 !bg-accent-500 !text-white hover:!bg-accent-600" onClick={deleteSelected} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
              </button>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>
          ) : visible.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Nenhum atendimento encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {isAdmin && (
                    <th className="w-10 py-3 pl-4">
                      <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={allVisibleSelected} onChange={toggleAll} title="Selecionar todos" />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Protocolo</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Atendente</th>
                  <th className="px-4 py-3 font-medium">Encerrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((t) => (
                  <tr key={t.id} onClick={() => setOpen(t)} className={`cursor-pointer hover:bg-brand-50/40 ${selected.has(t.id) ? "bg-accent-50/50" : ""}`}>
                    {isAdmin && (
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="h-4 w-4 cursor-pointer accent-brand-600" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      </td>
                    )}
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
                        {t.closedBy === "inactivity" ? (<><Bot className="h-3 w-3" /> Ausência do cliente</>) : t.closedBy === "finance" ? (<><Bot className="h-3 w-3" /> Enviado ao Financeiro</>) : t.closedByName ? `por ${t.closedByName}` : ""}
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
        <Credit className="mt-auto pt-10 text-center" />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]" onClick={() => setOpen(null)}>
          <div className="relative h-full w-full max-w-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <ChatPanel ticket={open} readOnly onDeleted={() => setOpen(null)} onClose={() => setOpen(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
