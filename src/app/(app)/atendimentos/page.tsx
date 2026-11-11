"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Inbox, ListChecks, Loader2, MessageCircleHeart, MessageSquarePlus, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { relative, useNow } from "@/lib/client";
import { useQuickReplies, useSettings, useTeam } from "@/lib/hooks";
import type { Ticket } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { ChatPanel } from "@/components/ChatPanel";
import { Credit } from "@/components/Credit";
import { NewConversation } from "@/components/NewConversation";
import { MenuPanel, type MenuContact } from "@/components/MenuPanel";

type Tab = "mine" | "queue" | "team" | "menu";

export default function AtendimentosPage() {
  const { me: staff } = useAuth(); // identidade efetiva (quem está atendendo)
  // "Meu" = sou o responsável ou participo (admin atendendo como outro atendente).
  const isMineT = (t: Ticket) => t.assignedTo === staff?.uid || !!(staff?.uid && t.participants?.includes(staff.uid));
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const team = useTeam();
  const quickReplies = useQuickReplies();
  const { settings } = useSettings();
  const now = useNow(30_000);
  const [newConv, setNewConv] = useState<{ phone?: string } | null>(null);
  const justStarted = useRef<string | null>(null);
  const openFromLink = useRef<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      openFromLink.current = id;
      setSelectedId(id);
      setTickets((x) => [...x]); // reavalia a aba
    };
    window.addEventListener("open-ticket", h);
    return () => window.removeEventListener("open-ticket", h);
  }, []);

  // /atendimentos?nova=5534999999999 abre "Nova conversa" já com o contato (vindo de Contatos).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("t");
    if (openId) {
      openFromLink.current = openId;
      setSelectedId(openId);
      window.history.replaceState(null, "", "/atendimentos");
    }
    const phone = params.get("nova");
    if (phone) {
      setNewConv({ phone });
      window.history.replaceState(null, "", "/atendimentos");
    }
  }, []);

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
      mine: tickets.filter((t) => t.status === "open" && isMineT(t)).sort(byRecent),
      // fila: quem chegou primeiro aparece primeiro
      queue: tickets.filter((t) => t.status === "waiting").sort((a, b) => a.createdAt - b.createdAt),
      team: tickets.filter((t) => t.status === "open" && !isMineT(t)).sort(byRecent),
    };
  }, [tickets, staff?.uid]);

  // Aba inicial: "Meus" se houver, senão "Fila".
  useEffect(() => {
    if (!loading && tab === null) setTab(groups.mine.length ? "mine" : "queue");
  }, [loading, tab, groups.mine.length]);

  // Aberto pelo aviso de nova mensagem: vai para a aba certa.
  useEffect(() => {
    const id = openFromLink.current;
    if (!id || loading) return;
    const tk = tickets.find((x) => x.id === id);
    openFromLink.current = null;
    if (!tk) return;
    setTab(tk.status === "waiting" ? "queue" : isMineT(tk) ? "mine" : "team");
  }, [loading, tickets, staff?.uid]);


  const current: Ticket[] = tab && tab !== "menu" ? groups[tab] : [];
  const term = search.trim().toLowerCase();
  const visible = term
    ? current.filter(
        (t) =>
          t.contactName.toLowerCase().includes(term) ||
          t.phone.includes(term.replace(/\D/g, "") || "§") ||
          String(t.protocol).replace(/\D/g, "").includes(term.replace(/\D/g, "") || "§")
      )
    : current;

  // Clientes no menu (receberam as opções e ainda não escolheram)
  const [menuContacts, setMenuContacts] = useState<MenuContact[]>([]);
  const [menuPhone, setMenuPhone] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(query(collection(db(), "contacts"), where("menu.pendingSince", ">", 0)), (snap) =>
        setMenuContacts(
          snap.docs
            .map((d) => ({ ...(d.data() as MenuContact), phone: d.id }))
            .sort((a, b) => (b.menu?.pendingSince || 0) - (a.menu?.pendingSince || 0))
        )
      ),
    []
  );
  const menuSelected = tab === "menu" ? menuContacts.find((c) => c.phone === menuPhone) || null : null;
  const menuVisible = menuContacts.filter((c) => {
    const term = search.trim().toLowerCase();
    return !term || c.name?.toLowerCase().includes(term) || c.phone.includes(term.replace(/\D/g, "") || "§");
  });

  const selected = tab === "menu" ? null : tickets.find((t) => t.id === selectedId) || null;

  // Celular: com a conversa aberta, esconde a barra de navegação de baixo.
  useEffect(() => {
    document.body.dataset.chatOpen = selected || menuSelected ? "1" : "0";
    return () => {
      document.body.dataset.chatOpen = "0";
    };
  }, [selected, menuSelected]);

  // Se o atendimento selecionado for encerrado, sai dele.
  useEffect(() => {
    if (selectedId && !loading && !tickets.some((t) => t.id === selectedId) && justStarted.current !== selectedId) setSelectedId(null);
    if (selectedId && tickets.some((t) => t.id === selectedId) && justStarted.current === selectedId) justStarted.current = null;
  }, [tickets, selectedId, loading]);

  // Só no momento em que EU pego o atendimento aberto, muda para "Meus".
  // (Depois disso a pessoa pode navegar livremente entre as abas.)
  const prevAssign = useRef<{ id: string | null; to: string | null }>({ id: null, to: null });
  useEffect(() => {
    const prev = prevAssign.current;
    const to = selected && isMineT(selected) ? staff?.uid ?? null : selected?.assignedTo ?? null;
    if (selected && prev.id === selected.id && prev.to !== staff?.uid && to === staff?.uid) setTab("mine");
    prevAssign.current = { id: selected?.id ?? null, to };
  }, [selected, staff?.uid]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "mine", label: "Meus" },
    { id: "queue", label: "Fila" },
    { id: "team", label: "Equipe" },
    { id: "menu", label: "Menu" },
  ];

  return (
    <div className="flex h-full">
      {/* Lista */}
      <section className={`w-full shrink-0 flex-col border-r border-slate-200/70 bg-white md:flex md:w-[340px] lg:w-[380px] ${selected || menuSelected ? "hidden" : "flex"}`}>
        <div className="space-y-3 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-800">Atendimentos</h1>
            <button onClick={() => setNewConv({})} className="btn btn-soft px-3 py-1.5" title="Iniciar conversa">
              <MessageSquarePlus className="h-4 w-4" /> Nova conversa
            </button>
          </div>
          <div className="flex rounded-xl bg-slate-100 p-1">
            {TABS.map(({ id, label }) => {
              const count = id === "menu" ? menuContacts.length : groups[id].length;
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
                        id === "queue" ? "bg-accent-500 text-white" : id === "menu" ? "bg-amber-400 text-white" : active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-600"
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
          {tab === "menu" ? (
            menuVisible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-slate-400">
                <ListChecks className="h-8 w-8" />
                Ninguém parado no menu
              </div>
            ) : (
              <ul>
                {menuVisible.map((c) => {
                  const last = c.menu?.pending?.[c.menu.pending.length - 1];
                  const active = c.phone === menuPhone;
                  return (
                    <li key={c.phone}>
                      <button
                        onClick={() => setMenuPhone(c.phone)}
                        className={`flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition ${
                          active ? "border-amber-400 bg-amber-50/60" : "border-transparent hover:bg-slate-50"
                        }`}
                      >
                        <Avatar name={c.name} photo={c.photo} size={44} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-slate-800">{c.name}</span>
                            <span className="shrink-0 text-[11px] font-medium text-amber-600">{relative(c.menu?.pendingSince || 0, now)}</span>
                          </div>
                          <div className="truncate text-sm text-slate-500">{last ? last.text || "📎 Arquivo" : "Sem resposta ao menu"}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : loading ? (
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
                        {tab === "mine" && t.assignedTo !== staff?.uid && t.assignedName && (
                          <div className="mt-0.5 text-[11px] font-medium text-brand-600">atendendo como {t.assignedName}</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Credit className="border-t border-slate-100 py-2.5 text-center" />
      </section>

      {newConv && (
        <NewConversation
          initialPhone={newConv.phone}
          onClose={() => setNewConv(null)}
          onStarted={(id) => {
            justStarted.current = id;
            setNewConv(null);
            setSearch("");
            setTab("mine");
            setSelectedId(id);
          }}
        />
      )}

      {/* Conversa */}
      <section className={`min-w-0 flex-1 ${selected || menuSelected ? "block" : "hidden md:block"}`}>
        {menuSelected ? (
          <MenuPanel
            key={menuSelected.phone}
            contact={menuSelected}
            onBack={() => setMenuPhone(null)}
            onMoved={(id) => {
              justStarted.current = id;
              setMenuPhone(null);
              setTab("queue");
              setSelectedId(id);
            }}
          />
        ) : selected ? (
          <ChatPanel
            key={selected.id}
            ticket={selected}
            team={team}
            quickReplies={quickReplies}
            autoCloseMinutes={settings.autoCloseMinutes}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="chat-bg relative flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
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
