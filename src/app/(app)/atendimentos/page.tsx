"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Inbox, Loader2, MessageCircleHeart, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { relative, useNow } from "@/lib/client";
import { useQuickReplies, useSettings, useTeam } from "@/lib/hooks";
import type { Ticket } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { ChatPanel } from "@/components/ChatPanel";

type Tab = "mine" | "queue" | "team";

export default function AtendimentosPage() {
  const { staff } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const team = useTeam();
  const quickReplies = useQuickReplies();
  const { settings } = useSettings();
  const now = useNow(30_000);

  useEffect(() => {
    const q = query(collection(db(), "tickets"), where("status", "in", ["waiting", "open"]));
    return onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ ...(d.data() as Ticket), id: d.id })));
      setLoading(false);
    });
  }, []);

  const groups = useMemo(() => {
    const byRecent = (a: Ticket, b: Ticket) => b.lastMessageAt - a.lastMessageAt;
    return {
      mine: tickets.filter((t) => t.status === "open" && t.assignedTo === staff?.uid).sort(byRecent),
      // fila: quem chegou primeiro aparece primeiro
      queue: tickets.filter((t) => t.status === "waiting").sort((a, b) => a.createdAt - b.createdAt),
      team: tickets.filter((t) => t.status === "open" && t.assignedTo !== staff?.uid).sort(byRecent),
    };
  }, [tickets, staff?.uid]);

  // Aba inicial: "Meus" se houver, senão "Fila".
  useEffect(() => {
    if (!loading && tab === null) setTab(groups.mine.length ? "mine" : "queue");
  }, [loading, tab, groups.mine.length]);

  const current = tab ? groups[tab] : [];
  const term = search.trim().toLowerCase();
  const visible = term
    ? current.filter(
        (t) =>
          t.contactName.toLowerCase().includes(term) ||
          t.phone.includes(term.replace(/\D/g, "") || "§") ||
          String(t.protocol).replace(/\D/g, "").includes(term.replace(/\D/g, "") || "§")
      )
    : current;

  const selected = tickets.find((t) => t.id === selectedId) || null;

  // Se o atendimento selecionado for encerrado, sai dele.
  useEffect(() => {
    if (selectedId && !loading && !tickets.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tickets, selectedId, loading]);

  // Ao pegar um atendimento da fila, muda para "Meus".
  useEffect(() => {
    if (selected && selected.assignedTo === staff?.uid && tab === "queue") setTab("mine");
  }, [selected, staff?.uid, tab]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "mine", label: "Meus" },
    { id: "queue", label: "Fila" },
    { id: "team", label: "Equipe" },
  ];

  return (
    <div className="flex h-full">
      {/* Lista */}
      <section className={`w-full shrink-0 flex-col border-r border-slate-200/70 bg-white md:flex md:w-[340px] lg:w-[380px] ${selected ? "hidden" : "flex"}`}>
        <div className="space-y-3 px-4 pb-3 pt-4">
          <h1 className="text-lg font-semibold text-slate-800">Atendimentos</h1>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map(({ id, label }) => {
              const count = groups[id].length;
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition ${
                    active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[11px] ${
                        id === "queue" ? "bg-accent-500 text-white" : active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar nome, telefone ou protocolo" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-slate-400">
              <Inbox className="h-8 w-8" />
              {tab === "queue" ? "Nenhum cliente aguardando 🎉" : tab === "mine" ? "Você não tem atendimentos abertos" : "Nada por aqui"}
            </div>
          ) : (
            <ul>
              {visible.map((t) => {
                const active = t.id === selectedId;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition ${
                        active ? "border-brand-500 bg-brand-50/70" : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <Avatar name={t.contactName} photo={t.contactPhoto} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-slate-800">{t.contactName}</span>
                          <span className={`shrink-0 text-[11px] ${t.status === "waiting" ? "font-medium text-accent-500" : "text-slate-400"}`}>
                            {relative(t.status === "waiting" ? t.createdAt : t.lastMessageAt, now)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-slate-500">
                            {t.lastMessageFromMe && <span className="text-slate-400">Você: </span>}
                            {t.lastMessagePreview}
                          </span>
                          {t.unread > 0 && (
                            <span className="shrink-0 rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{t.unread}</span>
                          )}
                        </div>
                        {tab === "team" && t.assignedName && <div className="mt-0.5 text-[11px] text-slate-400">com {t.assignedName}</div>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Conversa */}
      <section className={`min-w-0 flex-1 ${selected ? "block" : "hidden md:block"}`}>
        {selected ? (
          <ChatPanel
            key={selected.id}
            ticket={selected}
            team={team}
            quickReplies={quickReplies}
            autoCloseMinutes={settings.autoCloseMinutes}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="chat-bg flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
            <div className="rounded-full bg-white p-5 shadow-sm">
              <MessageCircleHeart className="h-10 w-10 text-accent-500" />
            </div>
            <p className="font-medium text-slate-600">Olá, {staff?.name?.split(" ")[0]}!</p>
            <p className="max-w-xs text-sm">Selecione um atendimento ao lado ou pegue o próximo cliente da fila.</p>
          </div>
        )}
      </section>
    </div>
  );
}
