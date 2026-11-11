"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { BadgeCheck, Loader2, Phone, Search, SendHorizontal, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { api, formatPhone } from "@/lib/client";
import { formatPhoneInput, normalizePhone, onlyDigits } from "@/lib/br";
import type { Contact } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { useTeam } from "@/lib/hooks";
import { canDelegate } from "@/lib/types";
import { Avatar } from "./Avatar";
import { useBranding } from "./BrandingProvider";

type Props = {
  initialPhone?: string;
  onClose: () => void;
  onStarted: (ticketId: string) => void;
};

type Target = { phone: string; name: string; photo?: string | null; saved?: boolean };

export function NewConversation({ initialPhone, onClose, onStarted }: Props) {
  const { me: staff, staff: account } = useAuth();
  const delegate = canDelegate(account?.role); // admin/supervisor escolhem quem vai atender
  const team = useTeam().filter((u) => u.active);
  const [asUid, setAsUid] = useState("");
  const attendant = delegate ? team.find((u) => u.uid === asUid) : staff;
  const { branding } = useBranding();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getDocs(collection(db(), "contacts")).then((s) => {
      const list = s.docs.map((d) => ({ ...(d.data() as Contact), phone: d.id }));
      setContacts(list);
      if (initialPhone) {
        const c = list.find((x) => x.phone === initialPhone);
        choose(c ? { phone: c.phone, name: c.name, photo: c.photo, saved: c.saved } : { phone: initialPhone, name: "" });
      }
    }).catch(() => initialPhone && choose({ phone: initialPhone, name: "" }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function greeting(clientName: string, agentName?: string) {
    const first = (clientName || "").trim().split(/\s+/)[0];
    const hi = `Olá${first && !/^\d+$/.test(first) ? `, ${first}` : ""}!`;
    return agentName ? `${hi} Aqui é ${agentName.split(" ")[0]}, da ${branding.companyName}. ` : `${hi} Aqui é da ${branding.companyName}. `;
  }

  function chooseAttendant(uid: string) {
    setAsUid(uid);
    const name = team.find((u) => u.uid === uid)?.name;
    // atualiza a saudação se ela ainda for a automática
    if (target && (text === greeting(target.name) || team.some((u) => text === greeting(target.name, u.name)))) setText(greeting(target.name, name));
  }

  function choose(t: Target) {
    setTarget(t);
    setError("");
    const first = (t.name || "").trim().split(/\s+/)[0];
    setText(greeting(t.name, attendant?.name));
    setTimeout(() => {
      textRef.current?.focus();
      const l = textRef.current?.value.length || 0;
      textRef.current?.setSelectionRange(l, l);
    }, 30);
  }

  const digits = onlyDigits(query);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts.filter((c) => c.saved).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).slice(0, 8);
    return contacts
      .filter((c) => c.name?.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.includes(digits)))
      .sort((a, b) => Number(!!b.saved) - Number(!!a.saved) || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 8);
  }, [contacts, query, digits]);

  const typedPhone = digits.length >= 10 ? normalizePhone(digits) : "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      if (delegate && !asUid) throw new Error("Escolha quem vai atender");
      const r = await api<{ ticketId: string }>("/api/tickets/start", {
        phone: target.phone,
        text,
        name: target.name,
        ...(delegate && asUid !== account?.uid ? { asUid } : {}),
      });
      onStarted(r.ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar conversa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 p-4 pt-[10vh] backdrop-blur-[1px]" onClick={onClose}>
      <div className="card w-full max-w-md overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Nova conversa</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!target ? (
          <div className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                className="input pl-9"
                placeholder="Buscar contato ou digitar o número com DDD"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typedPhone) choose({ phone: typedPhone, name: "" });
                }}
              />
            </div>

            {typedPhone && (
              <button
                onClick={() => choose({ phone: typedPhone, name: "" })}
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 px-3 py-2.5 text-left hover:bg-brand-50"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-800">Conversar com {formatPhoneInput(digits)}</div>
                  <div className="text-xs text-slate-500">Usar o número digitado</div>
                </div>
              </button>
            )}

            <div className="mt-3">
              {!query && results.length > 0 && <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Contatos salvos</div>}
              {results.map((c) => (
                <button
                  key={c.phone}
                  onClick={() => choose({ phone: c.phone, name: c.name, photo: c.photo, saved: c.saved })}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50"
                >
                  <Avatar name={c.name} photo={c.photo} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 truncate text-sm font-medium">
                      {c.name} {c.saved && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                    </div>
                    <div className="text-xs text-slate-400">{formatPhone(c.phone)}</div>
                  </div>
                </button>
              ))}
              {query && !results.length && !typedPhone && (
                <p className="py-6 text-center text-sm text-slate-400">Nenhum contato. Digite o número com DDD.</p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4 p-5">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <Avatar name={target.name || "Cliente"} photo={target.photo} size={40} />
              <div className="min-w-0 flex-1">
                {target.saved || target.name ? (
                  <div className="truncate text-sm font-medium">{target.name}</div>
                ) : (
                  <input
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                    placeholder="Nome do cliente (opcional)"
                    value={target.name}
                    onChange={(e) => setTarget({ ...target, name: e.target.value })}
                  />
                )}
                <div className="text-xs text-slate-500">{formatPhone(target.phone)}</div>
              </div>
              {!initialPhone && (
                <button type="button" onClick={() => setTarget(null)} className="text-xs font-medium text-brand-700 hover:underline">
                  Trocar
                </button>
              )}
            </div>
            {delegate && (
              <div>
                <label className="label">Quem vai atender?</label>
                <select className="input" value={asUid} onChange={(e) => chooseAttendant(e.target.value)} required>
                  <option value="" disabled>
                    Selecione quem vai atender…
                  </option>
                  {team.map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">Primeira mensagem</label>
              <textarea ref={textRef} className="input min-h-[110px]" value={text} onChange={(e) => setText(e.target.value)} required />
              <p className="mt-1 text-xs text-slate-400">O atendimento já abre no nome de quem vai atender, com protocolo.</p>
            </div>
            {error && <p className="text-sm text-accent-600">{error}</p>}
            <button className="btn btn-primary w-full" disabled={busy || !text.trim() || (delegate && !asUid)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />} Enviar e abrir atendimento
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
