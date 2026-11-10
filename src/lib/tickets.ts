import "server-only";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { HttpError } from "./api";
import { parseContent, previewOf, zapi, type ZapiReceived, type ZapiStatus } from "./zapi";
import {
  DEFAULT_SETTINGS,
  renderTemplate,
  type ClosedBy,
  type Message,
  type MessageType,
  type Settings,
  type StaffUser,
  type Ticket,
} from "./types";

const db = () => adminDb();
const ticketRef = (id: string) => db().doc(`tickets/${id}`);
const safeId = (s: string) => String(s).replace(/\//g, "_");

/** Data no fuso de Brasília no formato AAAAMMDD. */
function todayKey(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}${p.month}${p.day}`;
}

export async function getSettings(): Promise<Settings> {
  const snap = await db().doc("settings/general").get();
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) };
}

/* ------------------------------------------------------------------ */
/* Mensagens de saída                                                  */
/* ------------------------------------------------------------------ */

type Outgoing = {
  type: MessageType;
  text: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

async function deliver(phone: string, msg: Outgoing, signature?: string) {
  const signed = signature && msg.text ? `*${signature}:*\n${msg.text}` : msg.text;
  switch (msg.type) {
    case "text":
      return zapi.sendText(phone, signed);
    case "image":
      return zapi.sendImage(phone, msg.mediaUrl!, signed || undefined);
    case "video":
      return zapi.sendVideo(phone, msg.mediaUrl!, signed || undefined);
    case "audio":
      return zapi.sendAudio(phone, msg.mediaUrl!);
    case "document":
      return zapi.sendDocument(phone, msg.mediaUrl!, msg.fileName || "arquivo.pdf");
    default:
      throw new HttpError(400, "Tipo de mensagem não suportado");
  }
}

/**
 * Envia pelo WhatsApp e registra no ticket.
 * startTimer = true reinicia a contagem de ausência do cliente.
 */
export async function sendOutbound(
  ticket: Pick<Ticket, "id" | "phone">,
  msg: Outgoing,
  opts: { source: "agent" | "bot"; agent?: StaffUser | null; startTimer: boolean; signature?: string }
) {
  const res = await deliver(ticket.phone, msg, opts.signature);
  const now = Date.now();
  const id = safeId(res.messageId || res.id || `${now}`);
  const doc: Omit<Message, "id"> = {
    source: opts.source,
    type: msg.type,
    text: msg.text,
    mediaUrl: msg.mediaUrl ?? null,
    fileName: msg.fileName ?? null,
    mimeType: msg.mimeType ?? null,
    agentUid: opts.agent?.uid ?? null,
    agentName: opts.agent?.name ?? null,
    status: "sent",
    createdAt: now,
  };
  const ref = ticketRef(ticket.id);
  const batch = db().batch();
  batch.set(ref.collection("messages").doc(id), doc);
  batch.update(ref, {
    lastMessageAt: now,
    lastMessagePreview: previewOf(msg.type, msg.text),
    lastMessageFromMe: true,
    ...(opts.startTimer ? { awaitingCustomerSince: now } : {}),
  });
  await batch.commit();
  return id;
}

function addSystemNote(ref: DocumentReference, text: string) {
  return ref.collection("messages").add({
    source: "system",
    type: "system",
    text,
    createdAt: Date.now(),
  } satisfies Omit<Message, "id">);
}

/* ------------------------------------------------------------------ */
/* Webhook: mensagem recebida                                          */
/* ------------------------------------------------------------------ */

export async function handleReceived(p: ZapiReceived): Promise<{ ticketId?: string; isNew?: boolean } | null> {
  if (p.isGroup || p.isNewsletter || p.broadcast || p.isStatusReply) return null;
  if (!p.phone || !p.messageId) return null;
  if (p.fromMe && p.fromApi) return null; // já registrado por nós ao enviar

  const content = parseContent(p);
  if (!content) return null;

  const phone = safeId(p.phone);
  const msgId = safeId(p.messageId);
  const now = Date.now();
  const contactRef = db().doc(`contacts/${phone}`);
  const counterRef = db().doc("meta/counters");

  // Mensagem enviada direto do celular da farmácia: só registra no atendimento ativo.
  if (p.fromMe) {
    const contact = (await contactRef.get()).data();
    if (!contact?.activeTicketId) return null;
    const ref = ticketRef(contact.activeTicketId);
    const t = (await ref.get()).data() as Ticket | undefined;
    if (!t || t.status === "closed") return null;
    await ref.collection("messages").doc(msgId).set({
      source: "phone",
      ...content,
      status: "sent",
      createdAt: now,
    });
    await ref.update({
      lastMessageAt: now,
      lastMessagePreview: previewOf(content.type, content.text),
      lastMessageFromMe: true,
      ...(t.status === "open" ? { awaitingCustomerSince: now } : {}),
    });
    return { ticketId: ref.id, isNew: false };
  }

  const waName = p.senderName || p.chatName || p.phone;
  const photo = p.senderPhoto || p.photo || null;

  return db().runTransaction(async (tx) => {
    const contactSnap = await tx.get(contactRef);
    const contact = contactSnap.data();
    // Nome salvo pela equipe tem prioridade sobre o nome do WhatsApp.
    const name: string = contact?.saved && contact?.name ? contact.name : waName;

    let ref: DocumentReference | null = null;
    if (contact?.activeTicketId) {
      const r = ticketRef(contact.activeTicketId);
      const s = await tx.get(r);
      if (s.exists && s.data()!.status !== "closed") ref = r;
    }

    if (ref) {
      const dup = await tx.get(ref.collection("messages").doc(msgId));
      if (dup.exists) return { ticketId: ref.id, isNew: false };
    }

    let isNew = false;
    let protocol = "";
    if (!ref) {
      const counter = await tx.get(counterRef);
      // Protocolo = AAAAMMDD-NNN, sequência reinicia a cada dia.
      const day = todayKey();
      const c = counter.data();
      const seq = c?.day === day ? ((c?.daySeq as number) || 0) + 1 : 1;
      protocol = `${day}-${String(seq).padStart(3, "0")}`;
      ref = db().collection("tickets").doc();
      isNew = true;
      tx.set(counterRef, { day, daySeq: seq }, { merge: true });
    }

    tx.set(
      contactRef,
      { phone: p.phone, name, waName, photo, lastMessageAt: now, activeTicketId: ref.id, lastTicketId: ref.id },
      { merge: true }
    );

    const preview = previewOf(content.type, content.text);
    if (isNew) {
      const t: Omit<Ticket, "id"> = {
        protocol,
        phone: p.phone,
        contactName: name,
        contactPhoto: photo,
        status: "waiting",
        assignedTo: null,
        assignedName: null,
        createdAt: now,
        assignedAt: null,
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastMessageFromMe: false,
        awaitingCustomerSince: null,
        unread: 1,
      };
      tx.set(ref, t);
    } else {
      tx.update(ref, {
        contactName: name,
        contactPhoto: photo,
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastMessageFromMe: false,
        awaitingCustomerSince: null,
        unread: FieldValue.increment(1),
      });
    }

    tx.set(ref.collection("messages").doc(msgId), {
      source: "customer",
      ...content,
      createdAt: now,
    } satisfies Omit<Message, "id">);

    return { ticketId: ref.id, isNew };
  });
}

/** Envia a mensagem de boas-vindas de um ticket recém-criado. */
export async function sendWelcome(ticketId: string) {
  const settings = await getSettings();
  if (!settings.welcomeMessage.trim()) return;
  const t = (await ticketRef(ticketId).get()).data() as Ticket | undefined;
  if (!t) return;
  const text = renderTemplate(settings.welcomeMessage, { nome: t.contactName, protocolo: t.protocol });
  await sendOutbound({ id: ticketId, phone: t.phone }, { type: "text", text }, { source: "bot", startTimer: false });
}

export async function handleStatus(p: ZapiStatus) {
  if (p.isGroup || !p.ids?.length || !p.phone) return;
  const contact = (await db().doc(`contacts/${safeId(p.phone)}`).get()).data();
  const tid = contact?.activeTicketId || contact?.lastTicketId;
  if (!tid) return;
  const status = String(p.status || "").toLowerCase();
  if (!["sent", "received", "read", "played"].includes(status)) return;
  await Promise.all(
    p.ids.map((id) =>
      ticketRef(tid)
        .collection("messages")
        .doc(safeId(id))
        .update({ status })
        .catch(() => undefined)
    )
  );
}

/* ------------------------------------------------------------------ */
/* Ações dos atendentes                                                */
/* ------------------------------------------------------------------ */

async function loadTicket(id: string): Promise<Ticket> {
  const snap = await ticketRef(id).get();
  if (!snap.exists) throw new HttpError(404, "Atendimento não encontrado");
  return { ...(snap.data() as Ticket), id };
}

export async function assignTicket(id: string, agent: StaffUser) {
  const ref = ticketRef(id);
  const ticket = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "Atendimento não encontrado");
    const t = { ...(snap.data() as Ticket), id };
    if (t.status === "closed") throw new HttpError(409, "Este atendimento já foi encerrado");
    if (t.status === "open" && t.assignedTo !== agent.uid)
      throw new HttpError(409, `${t.assignedName || "Outro atendente"} já pegou este atendimento`);
    tx.update(ref, {
      status: "open",
      assignedTo: agent.uid,
      assignedName: agent.name,
      assignedAt: Date.now(),
      awaitingCustomerSince: null,
    });
    return t;
  });
  if (ticket.status === "open") return { ok: true };

  await addSystemNote(ref, `${agent.name} assumiu o atendimento`);
  const settings = await getSettings();
  if (settings.assignedMessage.trim()) {
    const text = renderTemplate(settings.assignedMessage, {
      nome: ticket.contactName,
      atendente: agent.name,
      protocolo: ticket.protocol,
    });
    await sendOutbound(ticket, { type: "text", text }, { source: "bot", agent, startTimer: true });
  }
  return { ok: true };
}

function canAct(t: Ticket, user: StaffUser) {
  return t.assignedTo === user.uid || user.role === "admin";
}

export async function agentSend(id: string, user: StaffUser, msg: Outgoing) {
  const t = await loadTicket(id);
  if (t.status !== "open") throw new HttpError(409, "Pegue o atendimento antes de responder");
  if (!canAct(t, user)) throw new HttpError(403, "Este atendimento é de outro atendente");
  if (msg.type !== "text" && !msg.mediaUrl) throw new HttpError(400, "Arquivo ausente");
  if (msg.type === "text" && !msg.text.trim()) throw new HttpError(400, "Mensagem vazia");
  const settings = await getSettings();
  return sendOutbound(t, msg, {
    source: "agent",
    agent: user,
    startTimer: true,
    signature: settings.signMessages ? user.name : undefined,
  });
}

export async function transferTicket(id: string, user: StaffUser, toUid: string) {
  const t = await loadTicket(id);
  if (t.status === "closed") throw new HttpError(409, "Atendimento encerrado");
  if (t.status === "open" && !canAct(t, user)) throw new HttpError(403, "Este atendimento é de outro atendente");
  const to = (await db().doc(`users/${toUid}`).get()).data() as StaffUser | undefined;
  if (!to || !to.active) throw new HttpError(400, "Atendente inválido");
  await ticketRef(id).update({
    status: "open",
    assignedTo: toUid,
    assignedName: to.name,
    assignedAt: Date.now(),
  });
  await addSystemNote(ticketRef(id), `${user.name} transferiu o atendimento para ${to.name}`);
  return { ok: true };
}

/**
 * Encerra o ticket. Retorna false se já estava encerrado ou se `guard` recusou
 * (evita encerramentos duplicados quando várias abas/cron rodam ao mesmo tempo).
 */
export async function closeTicket(
  id: string,
  by: ClosedBy,
  user: StaffUser | null,
  guard?: (t: Ticket) => boolean
): Promise<boolean> {
  const ref = ticketRef(id);
  const t = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "Atendimento não encontrado");
    const t = { ...(snap.data() as Ticket), id };
    if (t.status === "closed") return null;
    if (user && t.status === "open" && !canAct(t, user))
      throw new HttpError(403, "Este atendimento é de outro atendente");
    if (guard && !guard(t)) return null;
    const contactRef = db().doc(`contacts/${safeId(t.phone)}`);
    const contact = await tx.get(contactRef);
    tx.update(ref, {
      status: "closed",
      closedAt: Date.now(),
      closedBy: by,
      closedByName: user?.name ?? null,
      awaitingCustomerSince: null,
      unread: 0,
    });
    if (contact.data()?.activeTicketId === id) tx.update(contactRef, { activeTicketId: null });
    return t;
  });
  if (!t) return false;

  await addSystemNote(
    ref,
    by === "inactivity" ? "Encerrado automaticamente por ausência do cliente" : `Encerrado por ${user?.name}`
  );
  const settings = await getSettings();
  const tpl = by === "inactivity" ? settings.inactivityMessage : settings.closedMessage;
  if (tpl.trim()) {
    const text = renderTemplate(tpl, { nome: t.contactName, atendente: user?.name, protocolo: t.protocol });
    await sendOutbound(t, { type: "text", text }, { source: "bot", startTimer: false }).catch((e) =>
      console.error("Falha ao enviar mensagem de encerramento", e)
    );
  }
  return true;
}

/** Encerra atendimentos em que o cliente não respondeu dentro do prazo configurado. */
export async function sweepInactive(): Promise<number> {
  const settings = await getSettings();
  const minutes = Math.max(1, Number(settings.autoCloseMinutes) || 10);
  const cutoff = Date.now() - minutes * 60_000;
  const snap = await db().collection("tickets").where("status", "==", "open").get();
  const stale = snap.docs.filter((d) => {
    const s = (d.data() as Ticket).awaitingCustomerSince;
    return s != null && s <= cutoff;
  });
  let closed = 0;
  for (const d of stale) {
    const ok = await closeTicket(d.id, "inactivity", null, (t) => t.awaitingCustomerSince != null && t.awaitingCustomerSince <= cutoff).catch(
      (e) => {
        console.error("sweep", d.id, e);
        return false;
      }
    );
    if (ok) closed++;
  }
  return closed;
}
