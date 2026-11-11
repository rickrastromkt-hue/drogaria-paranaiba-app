"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limitToLast, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { ArrowLeft, ArrowRightLeft, BadgeCheck, Camera, CheckCircle2, Mic, Hand, Loader2, SendHorizontal, Timer, Trash2, UserRound, X } from "lucide-react";
import { ImagePlus } from "lucide-react";
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { MAX_UPLOAD_BYTES, api, blobToDataUrl, duration, formatPhone, useNow } from "@/lib/client";
import { canDelegate, type Contact, type Message, type MessageType, type QuickReply, type StaffUser, type Ticket } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";
import { MessageBubble } from "./MessageBubble";
import { ContactForm } from "./ContactForm";
import { VoiceRecorder } from "./VoiceRecorder";
import { AssignModal } from "./AssignModal";
import { PreviousTickets } from "./PreviousTickets";

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
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const f = () => setNarrow(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const [recording, setRecording] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: Blob; name: string; preview: string } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
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

  const isAdmin = canDelegate(account?.role); // admin ou supervisor: "Atender como"
  const [askAssign, setAskAssign] = useState(false);
  // Admin/supervisor: abre "Quem vai atender?". Atendente: pega direto.
  const assign = () => (isAdmin ? setAskAssign(true) : run("assign", () => api(`/api/tickets/${ticket.id}/assign`, {})));
  const assignTo = async (uid: string) => {
    await api(`/api/tickets/${ticket.id}/assign`, uid !== staff?.uid ? { asUid: uid } : {});
    setAskAssign(false);
  };
  const close = () => {
    if (!confirm("Encerrar este atendimento? O cliente receberá a mensagem de encerramento.")) return;
    run("close", () => api(`/api/tickets/${ticket.id}/close`));
  };
  const transfer = (uid: string) => {
    setShowTransfer(false);
    run("transfer", () => api(`/api/tickets/${ticket.id}/transfer`, { toUid: uid }));
  };

  /* ---------- Envio otimista: a mensagem aparece na hora, com relógio / carregador ---------- */

  type Outbox = {
    key: string;
    type: MessageType;
    text: string;
    localUrl: string | null;
    fileName?: string;
    progress?: number; // 0–100 (upload de foto/vídeo)
    error?: string;
    createdAt: number;
    job: (onProgress: (p: number) => void) => Promise<unknown>;
  };
  const [outbox, setOutbox] = useState<Outbox[]>([]);

  function patchOut(key: string, patch: Partial<Outbox>) {
    setOutbox((list) => list.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function dropOut(key: string) {
    setOutbox((list) => {
      const o = list.find((x) => x.key === key);
      if (o?.localUrl) setTimeout(() => URL.revokeObjectURL(o.localUrl!), 30_000);
      return list.filter((x) => x.key !== key);
    });
  }

  async function runOut(o: Outbox) {
    patchOut(o.key, { error: undefined, progress: 0 });
    try {
      await o.job((p) => patchOut(o.key, { progress: p }));
      dropOut(o.key); // a mensagem verdadeira chega pelo Firestore
    } catch (e) {
      patchOut(o.key, { error: e instanceof Error ? e.message : "Falha ao enviar" });
    }
  }

  function enqueue(type: MessageType, textValue: string, localUrl: string | null, job: Outbox["job"], fileName?: string) {
    const o: Outbox = { key: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, text: textValue, localUrl, fileName, createdAt: Date.now(), job };
    setOutbox((list) => [...list, o]);
    setError("");
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 30);
    runOut(o);
  }

  function send() {
    const t = text.trim();
    if (pendingPhoto) {
      const p = pendingPhoto;
      setPendingPhoto(null); // a prévia vira a bolha "enviando"
      setText("");
      enqueue("image", t, p.preview, (onP) => uploadAndSend(p.file, p.name, t, onP), p.name);
      textarea.current?.focus();
      return;
    }
    if (!t) return;
    setText("");
    enqueue("text", t, null, () => api(`/api/tickets/${ticket.id}/send`, { type: "text", text: t }));
    textarea.current?.focus();
  }

  /**
   * Envia um arquivo pelo WhatsApp.
   * - Áudio: vai em base64 direto para a Z-API (cópia guardada no Firestore).
   * - Imagem, vídeo e documento: sobem para o Firebase Storage (com progresso), sem limite no sistema.
   */
  async function uploadAndSend(file: Blob, fileName: string, caption = "", onProgress?: (p: number) => void) {
    const mime = file.type || "application/octet-stream";
    const type = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
    let mediaUrl: string;
    if (type === "audio") {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("Áudio grande demais (máx. 3 MB).");
      mediaUrl = await blobToDataUrl(file);
    } else {
      const safeName = fileName.replace(/[^\w.\-]+/g, "_");
      const r = storageRef(storage(), `uploads/${ticket.id}/${Date.now()}-${safeName}`);
      try {
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(r, file, { contentType: mime });
          task.on(
            "state_changed",
            (s) => onProgress?.(s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0),
            reject,
            () => resolve()
          );
        });
      } catch (e) {
        const code = (e as { code?: string }).code || "";
        if (code.includes("unauthorized")) throw new Error("O Storage recusou o arquivo. Confira as regras do Storage no Firebase.");
        throw new Error("Não foi possível subir o arquivo. Confira se o Storage está ativado no Firebase.");
      }
      mediaUrl = await getDownloadURL(r);
    }
    onProgress?.(100);
    await api(`/api/tickets/${ticket.id}/send`, {
      type,
      text: type === "image" || type === "video" ? caption : "",
      mediaUrl,
      fileName,
      mimeType: mime,
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
    const type: MessageType = file.type.startsWith("video/") ? "video" : "document";
    enqueue(type, "", URL.createObjectURL(file), (onP) => uploadAndSend(file, file.name, "", onP), file.name);
  }

  const sendVoice = (mp3: Blob) => {
    const name = `audio-${Date.now()}.mp3`;
    enqueue("audio", "", URL.createObjectURL(mp3), () => uploadAndSend(mp3, name), name);
  };


  const remove = () => {
    if (!confirm(`Excluir o atendimento ${ticket.protocol} de ${ticket.contactName}?\n\nTodas as mensagens e arquivos serão apagados e isso NÃO pode ser desfeito.`)) return;
    run("delete", async () => {
      await api("/api/tickets/delete", { ids: [ticket.id] });
      onDeleted?.();
    });
  };

  const canTransfer = !readOnly && ticket.status === "open" && (isMine || account?.role === "admin");
  const canClose = !readOnly && ticket.status !== "closed" && (ticket.status === "waiting" || isMine || account?.role === "admin");

  let lastDay = "";

  return (
    <div className="relative flex h-full">
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center gap-2.5 border-b border-slate-200/70 bg-white px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {onBack && (
          <button onClick={onBack} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" title="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button onClick={() => setShowContact((v) => !v)} className="shrink-0 rounded-full" title="Dados do contato">
          <Avatar name={ticket.contactName} photo={ticket.contactPhoto} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-slate-800">{ticket.contactName}</span>
            {contact?.saved && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Contato salvo" />}
          </div>
          <div className="flex items-center gap-x-2 overflow-hidden whitespace-nowrap text-xs text-slate-500">
            <span>{formatPhone(ticket.phone)}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden truncate sm:inline">Protocolo {ticket.protocol}</span>
            {ticket.assignedName && <span className="hidden truncate md:inline">· Com {ticket.assignedName}</span>}
            {remaining != null && (
              <span
                title="Encerra automaticamente se o cliente não responder"
                className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium sm:inline-flex ${
                  remaining < 120_000 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Timer className="h-3 w-3" /> {duration(remaining)}
              </span>
            )}
          </div>
        </div>

        {/* Ações: só ícones no celular, com texto em telas grandes */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          {account?.role === "admin" && (
            <button onClick={remove} disabled={!!busy} className="btn btn-ghost px-2 hover:bg-accent-50 hover:text-accent-600 sm:px-2.5" title="Excluir atendimento">
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={() => setShowContact((v) => !v)}
            className={`btn px-2 sm:px-2.5 ${showContact ? "bg-brand-50 text-brand-700" : "btn-ghost"}`}
            title={contact?.saved ? "Dados do contato" : "Salvar contato"}
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden lg:inline">{contact?.saved ? "Contato" : "Salvar contato"}</span>
          </button>
          {canTransfer && (
            <button onClick={() => setShowTransfer((v) => !v)} className="btn btn-ghost px-2 sm:px-2.5" title="Transferir">
              <ArrowRightLeft className="h-4 w-4" />
              <span className="hidden lg:inline">Transferir</span>
            </button>
          )}
          {canClose && (
          <button onClick={close} disabled={!!busy} className="btn btn-danger px-2 sm:px-2.5" title="Encerrar">
            {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="hidden lg:inline">Encerrar</span>
          </button>
        )}
        </div>


        {showTransfer && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowTransfer(false)} />
            <div className="absolute right-3 top-14 z-30 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Transferir para</div>
              {team.filter((u) => u.active && u.uid !== ticket.assignedTo).map((u) => (
                <button key={u.uid} onClick={() => transfer(u.uid)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                  <Avatar name={u.name} size={24} /> {u.name}
                </button>
              ))}
            </div>
          </>
        )}

        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Mensagens */}
      <div className="chat-bg min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3 sm:px-8 sm:py-4">
        {!loadingMsgs && <PreviousTickets key={ticket.id} phone={ticket.phone} currentId={ticket.id} />}
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
        {outbox.map((o) => (
          <MessageBubble
            key={o.key}
            m={{
              id: o.key,
              source: "agent",
              type: o.type,
              text: o.text,
              mediaUrl: o.localUrl,
              fileName: o.fileName ?? null,
              agentName: staff?.name ?? null,
              status: o.error ? "failed" : "pending",
              createdAt: o.createdAt,
            }}
            sending={{ progress: o.progress, error: o.error, onRetry: () => runOut(o), onDiscard: () => dropOut(o.key) }}
          />
        ))}
        <div ref={bottom} />
      </div>

      {/* Rodapé / composer */}
      {error && <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</div>}

      {readOnly || ticket.status === "closed" ? (
        <div className="border-t border-slate-200/70 bg-white px-4 pt-3 pb-safe text-center text-sm text-slate-500">
          Atendimento encerrado
          {ticket.closedBy === "inactivity" ? " por ausência do cliente" : ticket.closedBy === "finance" ? " — cliente enviado ao Financeiro" : ticket.closedByName ? ` por ${ticket.closedByName}` : ""}.
        </div>
      ) : ticket.status === "waiting" ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 pt-3 pb-safe">
          <span className="text-sm text-slate-500">Cliente aguardando na fila</span>
          <button onClick={assign} disabled={!!busy} className="btn btn-primary">
            {busy === "assign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} Pegar atendimento
          </button>
          {askAssign && <AssignModal team={team} confirmLabel="Pegar atendimento" onConfirm={assignTo} onClose={() => setAskAssign(false)} />}
        </div>
      ) : !canAct ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-white px-4 pt-3 pb-safe text-sm text-slate-500">
          Em atendimento com {ticket.assignedName}.
        </div>
      ) : (
        <div className="pb-safe relative border-t border-slate-200/70 bg-white px-2 pt-2 sm:px-3 sm:pt-3">
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
          <div className="flex items-end gap-1 sm:gap-1.5">
            <button onClick={() => photoInput.current?.click()} disabled={!!busy} className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100 sm:p-2.5" title="Foto: tirar ou escolher">
              <Camera className="h-5 w-5" />
            </button>
            <input ref={photoInput} type="file" accept="image/*,video/*" hidden onChange={onFile} />
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
              placeholder={pendingPhoto ? (narrow ? "Legenda (opcional)" : "Legenda da foto (opcional)") : narrow ? "Mensagem" : "Mensagem  ( / = respostas rápidas )"}
              className="input max-h-40 min-h-[42px] resize-none py-2.5"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            {text.trim() || pendingPhoto ? (
              <button onClick={send} disabled={!text.trim() && !pendingPhoto} className="btn btn-primary h-[42px] w-[42px] shrink-0 p-0" title="Enviar">
                <SendHorizontal className="h-4 w-4" />
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
      <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col sm:max-w-[320px] border-l border-slate-200/70 bg-white shadow-xl xl:static xl:shadow-none">
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
