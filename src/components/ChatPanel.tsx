"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limitToLast, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRightLeft, BadgeCheck, Camera, CheckCircle2, Mic, Hand, Loader2, Paperclip, SendHorizontal, Timer, Trash2, UserRound, X } from "lucide-react";
import { ImagePlus } from "lucide-react";
import { db } from "@/lib/firebase";
import { MAX_UPLOAD_BYTES, api, blobToDataUrl, compressImage, duration, formatPhone, useNow } from "@/lib/client";
import type { Contact, Message, QuickReply, StaffUser, Ticket } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { ContactForm } from "./ContactForm";
import { VoiceRecorder } from "./VoiceRecorder";

type Props = {
  ticket: Ticket;
  team?: StaffUser[];
  quickReplies?: QuickReply[];
  autoCloseMinutes?: number;
  readOnly?: boolean;
  onBack?: () => void;
  onDeleted?: () => void;
  /** Mostra um X no cabeçalho (usado na gaveta do Histórico). */
  onClose?: () => void;
};

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function ChatPanel({ ticket, team = [], quickReplies = [], autoCloseMinutes = 10, readOnly, onBack, onDeleted, onClose }: Props) {
  const { staff: account, me: staff } = useAuth(); // staff = quem está atendendo; account = conta logada
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: Blob; name: string; preview: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const now = useNow(1000);

  const isMine = ticket.assignedTo === staff?.uid || !!(staff?.uid && ticket.participants?.includes(staff.uid));
  const canAct = !readOnly && ticket.status === "open" && (isMine || account?.role === "admin");

  useEffect(() => {
    setLoadingMsgs(true);
    setMessages([]);
    setText("");
    setError("");
    const q = query(collection(db(), "tickets", ticket.id, "messages"), orderBy("createdAt"), limitToLast(300));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ ...(d.data() as Message), id: d.id })));
      setLoadingMsgs(false);
    });
  }, [ticket.id]);

  useEffect(
    () => onSnapshot(doc(db(), "contacts", ticket.phone), (s) => setContact(s.exists() ? (s.data() as Contact) : null)),
    [ticket.phone]
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!readOnly && isMine && ticket.unread > 0) updateDoc(doc(db(), "tickets", ticket.id), { unread: 0 }).catch(() => {});
  }, [readOnly, isMine, ticket.unread, ticket.id, messages.length]);

  const remaining =
    ticket.status === "open" && ticket.awaitingCustomerSince
      ? ticket.awaitingCustomerSince + autoCloseMinutes * 60_000 - now
      : null;

  const qrMatches = useMemo(() => {
    if (!text.startsWith("/")) return [];
    const term = text.slice(1).toLowerCase();
    return quickReplies.filter((q) => q.shortcut.toLowerCase().includes(term) || q.text.toLowerCase().includes(term)).slice(0, 6);
  }, [text, quickReplies]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  const isAdmin = account?.role === "admin";
  const [asUid, setAsUid] = useState("");
  const assign = () =>
    run("assign", () => api(`/api/tickets/${ticket.id}/assign`, isAdmin && asUid && asUid !== staff?.uid ? { asUid } : {}));
  const close = () => {
    if (!confirm("Encerrar este atendimento? O cliente receberá a mensagem de encerramento.")) return;
    run("close", () => api(`/api/tickets/${ticket.id}/close`));
  };
  const transfer = (uid: string) => {
    setShowTransfer(false);
    run("transfer", () => api(`/api/tickets/${ticket.id}/transfer`, { toUid: uid }));
  };

  function send() {
    const t = text.trim();
    if (busy) return;
    if (pendingPhoto) {
      const p = pendingPhoto;
      run("send", async () => {
        await uploadAndSend(p.file, p.name, t);
        clearPhoto();
        setText("");
        textarea.current?.focus();
      });
      return;
    }
    if (!t) return;
    run("send", async () => {
      await api(`/api/tickets/${ticket.id}/send`, { type: "text", text: t });
      setText("");
      textarea.current?.focus();
    });
  }

  /** Envia o arquivo em base64 direto para o WhatsApp (sem Firebase Storage). */
  async function uploadAndSend(file: Blob, fileName: string, caption = "") {
    const mime = file.type || "application/octet-stream";
    const type = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
    const body = type === "image" ? await compressImage(file) : file;
    if (body.size > MAX_UPLOAD_BYTES) throw new Error("Arquivo grande demais (máx. 3 MB).");
    const dataUrl = await blobToDataUrl(body);
    await api(`/api/tickets/${ticket.id}/send`, {
      type,
      text: type === "image" || type === "video" ? caption : "",
      mediaUrl: dataUrl,
      fileName: type === "image" && body !== file ? fileName.replace(/\.\w+$/, "") + ".jpg" : fileName,
      mimeType: body.type || mime,
    });
    return type;
  }

  function pickPhoto(file: File) {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    setPendingPhoto({ file, name: file.name || `foto-${Date.now()}.jpg`, preview: URL.createObjectURL(file) });
    setError("");
    setTimeout(() => textarea.current?.focus(), 30);
  }

  function clearPhoto() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    setPendingPhoto(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("image/")) return pickPhoto(file); // fotos: mostra a prévia antes de enviar
    if (file.size > MAX_UPLOAD_BYTES) return setError("Arquivo grande demais (máx. 3 MB).");
    run("send", () => uploadAndSend(file, file.name));
  }

  const sendVoice = (mp3: Blob) => run("send", () => uploadAndSend(mp3, `audio-${Date.now()}.mp3`));


  const remove = () => {
    if (!confirm(`Excluir o atendimento ${ticket.protocol} de ${ticket.contactName}?\n\nTodas as mensagens e arquivos serão apagados e isso NÃO pode ser desfeito.`)) return;
    run("delete", async () => {
      await api("/api/tickets/delete", { ids: [ticket.id] });
      onDeleted?.();
    });
  };

  let lastDay = "";

  return (
    <div className="relative flex h-full">
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 border-b border-slate-200/70 bg-white px-4 py-3">
        {onBack && (
          <button onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar name={ticket.contactName} photo={ticket.contactPhoto} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-slate-800">{ticket.contactName}</span>
            {contact?.saved && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Contato salvo" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{formatPhone(ticket.phone)}</span>
            <span>·</span>
            <span>Protocolo {ticket.protocol}</span>
            {ticket.assignedName && (
              <>
                <span>·</span>
                <span>Com {ticket.assignedName}</span>
              </>
            )}
          </div>
        </div>

        {remaining != null && (
          <div
            title="Encerra automaticamente se o cliente não responder"
            className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium sm:flex ${
              remaining < 120_000 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <Timer className="h-3.5 w-3.5" /> {duration(remaining)}
          </div>
        )}

        {account?.role === "admin" && (
          <button onClick={remove} disabled={!!busy} className="btn btn-ghost px-2.5 hover:bg-accent-50 hover:text-accent-600" title="Excluir atendimento">
            {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={() => setShowContact((v) => !v)}
          className={`btn px-2.5 ${showContact ? "bg-brand-50 text-brand-700" : "btn-ghost"}`}
          title={contact?.saved ? "Dados do contato" : "Salvar contato"}
        >
          <UserRound className="h-4 w-4" />
          <span className="hidden lg:inline">{contact?.saved ? "Contato" : "Salvar contato"}</span>
        </button>

        {!readOnly && ticket.status !== "closed" && (
          <div className="flex items-center gap-1.5">
            {ticket.status === "open" && (isMine || account?.role === "admin") && (
              <div className="relative">
                <button onClick={() => setShowTransfer((v) => !v)} className="btn btn-ghost px-2.5" title="Transferir">
                  <ArrowRightLeft className="h-4 w-4" />
                  <span className="hidden lg:inline">Transferir</span>
                </button>
                {showTransfer && (
                  <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Transferir para</div>
                    {team.filter((u) => u.active && u.uid !== ticket.assignedTo).map((u) => (
                      <button key={u.uid} onClick={() => transfer(u.uid)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <Avatar name={u.name} size={24} /> {u.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(ticket.status === "waiting" || isMine || account?.role === "admin") && (
              <button onClick={close} disabled={!!busy} className="btn btn-danger px-2.5" title="Encerrar">
                {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                <span className="hidden lg:inline">Encerrar</span>
              </button>
            )}
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Mensagens */}
      <div className="chat-bg min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4 sm:px-8">
        {loadingMsgs && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          </div>
        )}
        {messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{day}</span>
                </div>
              )}
              <MessageBubble m={m} />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {/* Rodapé / composer */}
      {error && <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {readOnly || ticket.status === "closed" ? (
        <div className="border-t border-slate-200/70 bg-white px-4 py-3 text-center text-sm text-slate-500">
          Atendimento encerrado
          {ticket.closedBy === "inactivity" ? " por ausência do cliente" : ticket.closedBy === "finance" ? " — cliente enviado ao Financeiro" : ticket.closedByName ? ` por ${ticket.closedByName}` : ""}.
        </div>
      ) : ticket.status === "waiting" ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 py-3">
          <span className="text-sm text-slate-500">Cliente aguardando na fila</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm text-slate-500">
                <span className="hidden sm:inline">Atender como</span>
                <select className="input input-sm w-auto min-w-[150px]" value={asUid || staff?.uid || ""} onChange={(e) => setAsUid(e.target.value)}>
                  {team
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.uid === staff?.uid ? `${u.name} (eu)` : u.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button onClick={assign} disabled={!!busy} className="btn btn-primary">
              {busy === "assign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
              {isAdmin && asUid && asUid !== staff?.uid ? "Atribuir" : "Pegar atendimento"}
            </button>
          </div>
        </div>
      ) : !canAct ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-500">
          Em atendimento com {ticket.assignedName}.
        </div>
      ) : (
        <div className="relative border-t border-slate-200/70 bg-white px-3 py-3">
          {qrMatches.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {qrMatches.map((q) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setText(q.text);
                    textarea.current?.focus();
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                >
                  <div className="text-xs font-semibold text-brand-700">/{q.shortcut}</div>
                  <div className="truncate text-sm text-slate-600">{q.text}</div>
                </button>
              ))}
            </div>
          )}
          {pendingPhoto && !recording && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPhoto.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-center gap-1.5 font-medium text-slate-700">
                  <ImagePlus className="h-4 w-4 text-brand-600" /> Foto pronta para enviar
                </div>
                <div className="text-xs text-slate-400">Escreva uma legenda (opcional) e toque em enviar.</div>
              </div>
              <button onClick={clearPhoto} disabled={busy === "send"} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-accent-600" title="Remover">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {recording ? (
            <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} onError={setError} />
          ) : (
          <div className="flex items-end gap-1.5">
            <button onClick={() => fileInput.current?.click()} disabled={!!busy} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" title="Enviar arquivo">
              <Paperclip className="h-5 w-5" />
            </button>
            <button onClick={() => photoInput.current?.click()} disabled={!!busy} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" title="Foto: tirar ou escolher">
              <Camera className="h-5 w-5" />
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) pickPhoto(f);
              }}
            />
            <input ref={fileInput} type="file" hidden onChange={onFile} accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" />
            <textarea
              ref={textarea}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (qrMatches.length && text.startsWith("/")) setText(qrMatches[0].text);
                  else send();
                }
              }}
              placeholder={pendingPhoto ? "Legenda da foto (opcional)" : "Digite uma mensagem…  ( / para respostas rápidas )"}
              className="input max-h-40 min-h-[42px] resize-none py-2.5"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            {text.trim() || pendingPhoto || busy === "send" ? (
              <button onClick={send} disabled={!!busy || (!text.trim() && !pendingPhoto)} className="btn btn-primary h-[42px] w-[42px] shrink-0 p-0" title="Enviar">
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              </button>
            ) : (
              <button
                onClick={() => {
                  setError("");
                  setRecording(true);
                }}
                disabled={!!busy}
                className="btn btn-primary h-[42px] w-[42px] shrink-0 p-0"
                title="Gravar áudio"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
          )}

        </div>
      )}
    </div>

    {showContact && (
      <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[320px] flex-col border-l border-slate-200/70 bg-white shadow-xl xl:static xl:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3.5">
          <div>
            <div className="font-semibold text-slate-800">{contact?.saved ? "Dados do contato" : "Salvar contato"}</div>
            {contact?.saved && contact.updatedByName && (
              <div className="text-[11px] text-slate-400">Atualizado por {contact.updatedByName}</div>
            )}
          </div>
          <button onClick={() => setShowContact(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <Avatar name={contact?.name || ticket.contactName} photo={contact?.photo || ticket.contactPhoto} size={64} />
            <div className="text-sm text-slate-500">{formatPhone(ticket.phone)}</div>
          </div>
          <ContactForm contact={contact ?? { phone: ticket.phone, name: ticket.contactName }} lockedPhone={ticket.phone} />
        </div>
      </aside>
    )}
    </div>
  );
}
