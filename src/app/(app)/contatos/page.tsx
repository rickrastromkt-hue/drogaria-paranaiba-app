"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot } from "firebase/firestore";
import { BadgeCheck, BookUser, History, Loader2, Plus, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatPhone, relative, useNow } from "@/lib/client";
import { formatCpf, onlyDigits } from "@/lib/br";
import type { Contact } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { ContactForm } from "@/components/ContactForm";

type Filter = "saved" | "all";

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("saved");
  const [search, setSearch] = useState("");
  // null = fechado, "new" = novo contato, string = telefone em edição
  const [editing, setEditing] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(
    () =>
      onSnapshot(collection(db(), "contacts"), (snap) => {
        setContacts(snap.docs.map((d) => ({ ...(d.data() as Contact), phone: d.id })));
        setLoading(false);
      }),
    []
  );

  const counts = useMemo(() => ({ saved: contacts.filter((c) => c.saved).length, all: contacts.length }), [contacts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = onlyDigits(term);
    return contacts
      .filter((c) => filter === "all" || c.saved)
      .filter(
        (c) =>
          !term ||
          (c.name || "").toLowerCase().includes(term) ||
          (c.waName || "").toLowerCase().includes(term) ||
          (c.city || "").toLowerCase().includes(term) ||
          (!!digits && (c.phone.includes(digits) || (c.cpf || "").includes(digits)))
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
  }, [contacts, filter, search]);

  const current = editing && editing !== "new" ? contacts.find((c) => c.phone === editing) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Contatos</h1>
            <p className="text-sm text-slate-500">Clientes cadastrados pela equipe</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Novo contato
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([
              ["saved", "Salvos"],
              ["all", "Todos que chamaram"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  filter === id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
                <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-600">{counts[id]}</span>
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Nome, WhatsApp, cidade ou CPF" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-slate-400">
              <BookUser className="h-8 w-8" />
              {filter === "saved" && !search ? "Nenhum contato salvo ainda. Salve pelo atendimento ou clique em Novo contato." : "Nenhum contato encontrado."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">WhatsApp</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Cidade / UF</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">CPF</th>
                  <th className="px-4 py-3 text-right font-medium">Última conversa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c) => (
                  <tr key={c.phone} onClick={() => setEditing(c.phone)} className="cursor-pointer hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} photo={c.photo} size={34} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate font-medium">
                            {c.name}
                            {c.saved && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                          </div>
                          <div className="text-xs text-slate-400 sm:hidden">{formatPhone(c.phone)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{formatPhone(c.phone)}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {c.city || c.uf ? [c.city, c.uf].filter(Boolean).join(" / ") : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{c.cpf ? formatCpf(c.cpf) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">{c.lastMessageAt ? relative(c.lastMessageAt, now) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]" onClick={() => setEditing(null)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
              <div className="font-semibold">{editing === "new" ? "Novo contato" : current?.saved ? "Editar contato" : "Salvar contato"}</div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {current && (
                <div className="mb-5 flex flex-col items-center gap-2 text-center">
                  <Avatar name={current.name} photo={current.photo} size={64} />
                  {current.lastTicketId && (
                    <Link href={`/historico?q=${current.phone}`} className="btn btn-soft text-xs">
                      <History className="h-3.5 w-3.5" /> Ver atendimentos
                    </Link>
                  )}
                </div>
              )}
              <ContactForm
                contact={current}
                onSaved={(phone) => {
                  if (editing === "new") setEditing(phone);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
