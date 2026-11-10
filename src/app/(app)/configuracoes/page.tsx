"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { CheckCircle2, Link2, Loader2, Plus, RefreshCw, Save, Trash2, WifiOff, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import { api } from "@/lib/client";
import { formatPhoneInput, onlyDigits } from "@/lib/br";
import { useQuickReplies, useSettings } from "@/lib/hooks";
import type { Settings } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";

type ZStatus = { connected: boolean; smartphoneConnected?: boolean; error?: string; qr?: string | null };

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      {desc && <p className="mb-4 mt-0.5 text-sm text-slate-500">{desc}</p>}
      {children}
    </section>
  );
}

function ConnectionCard() {
  const [status, setStatus] = useState<ZStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      setStatus(await api<ZStatus>("/api/zapi/status", undefined, "GET"));
    } catch (e) {
      setStatus(null);
      setMsg(e instanceof Error ? e.message : "Erro ao consultar a Z-API");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function configureWebhook() {
    setMsg("");
    try {
      const r = await api<{ url: string }>("/api/zapi/webhook");
      setMsg(`Webhook configurado: ${r.url}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <Section title="WhatsApp (Z-API)" desc="Status da conexão do número da farmácia.">
      <div className="flex flex-wrap items-center gap-3">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        ) : status?.connected ? (
          <span className="flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">
            <CheckCircle2 className="h-4 w-4" /> Conectado
          </span>
        ) : (
          <span className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
            <WifiOff className="h-4 w-4" /> Desconectado
          </span>
        )}
        <button className="btn btn-ghost" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        <button className="btn btn-soft" onClick={configureWebhook}>
          <Link2 className="h-4 w-4" /> Configurar webhook automaticamente
        </button>
      </div>
      {status && !status.connected && status.qr && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <p className="text-sm text-slate-500">Abra o WhatsApp no celular › Aparelhos conectados › Conectar e leia o QR Code:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={status.qr} alt="QR Code" className="h-56 w-56 rounded-xl border border-slate-200" />
        </div>
      )}
      {msg && <p className="mt-3 break-all text-sm text-slate-600">{msg}</p>}
    </Section>
  );
}

function MessagesForm() {
  const { settings, loaded } = useSettings();
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded) setForm(settings);
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.menuEnabled && form.financeMessage.includes("{financeiro}") && onlyDigits(form.financeWhatsapp).length < 10) {
      alert("Informe o WhatsApp do Financeiro (DDD + número).");
      return;
    }
    setSaving(true);
    await setDoc(doc(db(), "settings", "general"), {
      ...form,
      autoCloseMinutes: Math.max(1, Math.min(240, Number(form.autoCloseMinutes) || 10)),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const field = (key: keyof Settings, label: string, hint: string) => (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input min-h-[84px]"
        value={String(form[key] ?? "")}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder="Deixe vazio para não enviar"
      />
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );

  return (
    <Section title="Mensagens automáticas" desc="Variáveis disponíveis: {nome}, {atendente}, {protocolo}. Use *texto* para negrito.">
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={form.menuEnabled}
              onChange={(e) => setForm({ ...form, menuEnabled: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Menu inicial (Atendimento ou Financeiro)</span>
              <span className="text-xs text-slate-500">
                Antes de abrir o atendimento, pergunta o assunto. <b>1</b> = vai para a fila com protocolo · <b>2</b> = recebe o contato do financeiro.
              </span>
            </span>
          </label>
          {form.menuEnabled && (
            <>
              <div>
                <label className="label">Formato do menu</label>
                <select
                  className="input"
                  value={form.menuStyle}
                  onChange={(e) => setForm({ ...form, menuStyle: e.target.value as Settings["menuStyle"] })}
                >
                  <option value="buttons">Botões (o cliente toca na opção)</option>
                  <option value="list">Lista de opções (abre um menu ao tocar)</option>
                  <option value="text">Texto com números (1 / 2)</option>
                </select>
                {form.menuStyle !== "text" && (
                  <p className="mt-1 text-xs text-slate-400">
                    Alguns aparelhos/versões do WhatsApp não exibem botões. Se a Z-API recusar o envio, o menu em texto é usado no lugar.
                  </p>
                )}
              </div>
              {form.menuStyle !== "text" && (
                <>
                  {field("menuButtonsMessage", "Texto acima dos botões", "Primeira mensagem para quem chama sem atendimento aberto.")}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Botão 1 (abre atendimento)</label>
                      <input className="input" maxLength={20} value={form.menuOption1Label} onChange={(e) => setForm({ ...form, menuOption1Label: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Botão 2 (financeiro)</label>
                      <input className="input" maxLength={20} value={form.menuOption2Label} onChange={(e) => setForm({ ...form, menuOption2Label: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
              {field(
                "menuMessage",
                form.menuStyle === "text" ? "Mensagem do menu" : "Menu em texto (reserva)",
                form.menuStyle === "text" ? "Primeira mensagem para quem chama sem atendimento aberto." : "Usado se os botões não puderem ser enviados. O cliente também pode responder digitando 1 ou 2."
              )}
              {form.menuStyle === "text" && field("menuInvalidMessage", "Resposta inválida", "Quando o cliente não responde 1 ou 2.")}
              <div>
                <label className="label">WhatsApp do Financeiro</label>
                <input
                  className="input"
                  inputMode="tel"
                  placeholder="(34) 99999-9999"
                  value={formatPhoneInput(form.financeWhatsapp)}
                  onChange={(e) => setForm({ ...form, financeWhatsapp: onlyDigits(e.target.value) })}
                />
              </div>
              {field("financeMessage", "Mensagem para quem escolher Financeiro", "Use {financeiro} para inserir o link do WhatsApp do financeiro.")}
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                  checked={form.financeNotify}
                  onChange={(e) => setForm({ ...form, financeNotify: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium">Avisar o WhatsApp do Financeiro</span>
                  <span className="text-xs text-slate-500">Envia para o financeiro o nome, o link do cliente e a mensagem dele.</span>
                </span>
              </label>
              {form.financeNotify &&
                field("financeNotifyMessage", "Aviso enviado ao Financeiro", "Variáveis: {nome}, {telefone} (link do cliente), {mensagem}.")}
            </>
          )}
        </div>

        {field("welcomeMessage", "Boas-vindas / protocolo", "Enviada quando o atendimento é aberto (após escolher 1, se o menu estiver ligado).")}
        {field("assignedMessage", "Ao pegar o atendimento", "Enviada quando um atendente assume a conversa.")}
        {field("closedMessage", "Encerramento pelo atendente", "Enviada quando o atendente finaliza.")}
        {field("inactivityMessage", "Encerramento por ausência", "Enviada quando o cliente não responde dentro do prazo.")}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Encerrar por ausência do cliente após (minutos)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={240}
              value={form.autoCloseMinutes}
              onChange={(e) => setForm({ ...form, autoCloseMinutes: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-slate-400">Conta a partir da última mensagem da farmácia sem resposta.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={form.signMessages}
              onChange={(e) => setForm({ ...form, signMessages: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-medium">Assinar mensagens</span>
              <span className="text-xs text-slate-500">Envia o nome do atendente em negrito antes do texto.</span>
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-brand-700">Salvo!</span>}
          <button className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </form>
    </Section>
  );
}

function QuickRepliesCard() {
  const items = useQuickReplies();
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const s = shortcut.trim().replace(/^\//, "").replace(/\s+/g, "-").toLowerCase();
    if (!s || !text.trim()) return;
    await addDoc(collection(db(), "quickReplies"), { shortcut: s, text: text.trim() });
    setShortcut("");
    setText("");
  }

  return (
    <Section title="Respostas rápidas" desc="No chat, digite / para buscar e inserir uma resposta pronta.">
      <form onSubmit={add} className="mb-4 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
        <input className="input" placeholder="atalho (ex: pix)" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
        <input className="input" placeholder="Texto da resposta" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-soft">
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma resposta cadastrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {items.map((q) => (
            <li key={q.id} className="flex items-start gap-3 px-3 py-2.5">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-brand-700">/{q.shortcut}</div>
                <div className="whitespace-pre-wrap text-sm text-slate-600">{q.text}</div>
              </div>
              <button onClick={() => deleteDoc(doc(db(), "quickReplies", q.id))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default function ConfiguracoesPage() {
  const { staff } = useAuth();
  if (staff?.role !== "admin") return <p className="p-6 text-sm text-slate-500">Apenas administradores.</p>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">Ajustes</h1>
          <p className="text-sm text-slate-500">Conexão, mensagens automáticas e respostas rápidas</p>
        </div>
        <ConnectionCard />
        <MessagesForm />
        <QuickRepliesCard />
      </div>
    </div>
  );
}
