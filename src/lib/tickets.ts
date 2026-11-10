import "server-only";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { HttpError } from "./api";
import { parseContent, previewOf, zapi, type ZapiReceived, type ZapiStatus } from "./zapi";
import { normalizePhone } from "./br";
import {
  DEFAULT_SETTINGS,
  renderTemplate,
  type ClosedBy,
  type Contact,
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

export async function handleReceived(p: ZapiReceived): Promise<ReceivedResult | null> {
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
    return { action: "none", ticketId: ref.id };
  }

  const waName = p.senderName || p.chatName || p.phone;
  const photo = p.senderPhoto || p.photo || null;
  const settings = await getSettings();

  return db().runTransaction(async (tx): Promise<ReceivedResult> => {
    const contactSnap = await tx.get(contactRef);
    const contact = contactSnap.data();
    // Nome salvo pela equipe tem prioridade sobre o nome do WhatsApp.
    const name: string = contact?.saved && contact?.name ? contact.name : waName;
    const base = { phone: p.phone, name, waName, photo, lastMessageAt: now };

    let ref: DocumentReference | null = null;
    if (contact?.activeTicketId) {
      const r = ticketRef(contact.activeTicketId);
      const s = await tx.get(r);
      if (s.exists && s.data()!.status !== "closed") ref = r;
    }

    if (ref) {
      const dup = await tx.get(ref.collection("messages").doc(msgId));
      if (dup.exists) return { action: "none", ticketId: ref.id };
    }

    // Todas as leituras antes de qualquer escrita (regra das transações do Firestore).
    const counterSnap = !ref ? await tx.get(counterRef) : null;

    const incoming: PendingMessage = { id: msgId, ...content, createdAt: now };
    let backlog: PendingMessage[] = [];

    /* ---------- Menu inicial (só quando não há atendimento aberto) ---------- */
    if (!ref && settings.menuEnabled) {
      const menu = (contact?.menu || {}) as MenuState;
      const pendingActive = !!menu.pendingSince && now - menu.pendingSince < MENU_TTL;
      const pending = pendingActive ? menu.pending || [] : [];
      if (pending.some((m) => m.id === msgId)) return { action: "none" };
      // Toque em botão/lista chega com o id da opção ("1" ou "2").
      const choiceId = p.buttonsResponseMessage?.buttonId || p.listResponseMessage?.selectedRowId || "";
      const choice = parseChoice(choiceId) || parseChoice(content.text, settings);

      if (pendingActive || choice) {
        if (choice === "finance") {
          // Registra como atendimento já ENCERRADO (aparece no Histórico como "Financeiro").
          const msgs = [...pending, incoming];
          const first = msgs.find((m) => m.text && !parseChoice(m.text));
          const fref = db().collection("tickets").doc();
          const finTicket: Omit<Ticket, "id"> = {
            protocol: nextProtocol(tx, counterSnap!),
            phone: p.phone,
            contactName: name,
            contactPhoto: photo,
            status: "closed",
            assignedTo: null,
            assignedName: null,
            createdAt: msgs[0].createdAt,
            assignedAt: null,
            closedAt: now,
            closedBy: "finance",
            closedByName: null,
            lastMessageAt: now,
            lastMessagePreview: previewOf(content.type, content.text),
            lastMessageFromMe: false,
            awaitingCustomerSince: null,
            unread: 0,
          };
          tx.set(fref, finTicket);
          for (const m of msgs) {
            const { id, ...rest } = m;
            tx.set(fref.collection("messages").doc(id), { source: "customer", ...rest } satisfies Omit<Message, "id">);
          }
          tx.set(
            contactRef,
            { ...base, activeTicketId: null, lastTicketId: fref.id, menu: { pendingSince: null, pending: [], financeAt: now } },
            { merge: true }
          );
          return { action: "finance", ticketId: fref.id, name, firstText: first?.text || content.text };
        }
        if (choice === "service") {
          backlog = pending; // mensagens enviadas antes da escolha entram no atendimento
          tx.set(contactRef, { menu: { pendingSince: null, pending: [], financeAt: menu.financeAt ?? null } }, { merge: true });
        } else {
          tx.set(
            contactRef,
            { ...base, menu: { ...menu, pendingSince: menu.pendingSince || now, pending: [...pending, incoming].slice(-20) } },
            { merge: true }
          );
          return { action: "invalid", name };
        }
      } else {
        // Nunca ignora mensagem: sem atendimento aberto, sempre responde com o menu.
        tx.set(contactRef, { ...base, menu: { pendingSince: now, pending: [incoming], financeAt: null } }, { merge: true });
        return { action: "menu", name };
      }
    }

    /* ---------- Atendimento ---------- */
    let isNew = false;
    let protocol = "";
    if (!ref) {
      protocol = nextProtocol(tx, counterSnap!);
      ref = db().collection("tickets").doc();
      isNew = true;
    }

    tx.set(contactRef, { ...base, activeTicketId: ref.id, lastTicketId: ref.id }, { merge: true });

    const preview = previewOf(content.type, content.text);
    const all = [...backlog, incoming];
    if (isNew) {
      const tk: Omit<Ticket, "id"> = {
        protocol,
        phone: p.phone,
        contactName: name,
        contactPhoto: photo,
        status: "waiting",
        assignedTo: null,
        assignedName: null,
        createdAt: all[0].createdAt,
        assignedAt: null,
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastMessageFromMe: false,
        awaitingCustomerSince: null,
        unread: all.length,
      };
      tx.set(ref, tk);
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

    for (const m of all) {
      const { id, ...rest } = m;
      tx.set(ref.collection("messages").doc(id), { source: "customer", ...rest } satisfies Omit<Message, "id">);
    }

    return { action: isNew ? "welcome" : "none", ticketId: ref.id, isNew };
  });
}

/** Protocolo = AAAAMMDD-NNN, sequência reinicia a cada dia. Grava o contador na transação. */
function nextProtocol(tx: Transaction, counter: DocumentSnapshot): string {
  const day = todayKey();
  const c = counter.data();
  const seq = c?.day === day ? ((c?.daySeq as number) || 0) + 1 : 1;
  tx.set(counter.ref, { day, daySeq: seq }, { merge: true });
  return `${day}-${String(seq).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Iniciar conversa (pela farmácia)                                    */
/* ------------------------------------------------------------------ */

/** Variações do número com/sem o 9º dígito (o WhatsApp às vezes usa o formato antigo). */
function phoneVariants(phone: string) {
  const v = [phone];
  if (phone.length === 13 && phone[4] === "9") v.push(phone.slice(0, 4) + phone.slice(5));
  if (phone.length === 12) v.push(phone.slice(0, 4) + "9" + phone.slice(4));
  return v;
}

async function resolveWhatsappPhone(phone: string): Promise<string> {
  const variants = phoneVariants(phone);
  // Se já existe contato com alguma variação, usa ele (mantém o mesmo histórico).
  for (const v of variants) if ((await db().doc(`contacts/${v}`).get()).exists) return v;
  let checked = false;
  for (const v of variants) {
    try {
      const r = await zapi.phoneExists(v);
      checked = true;
      if (r.exists) return safeId(r.phone || v);
    } catch (e) {
      console.error("phone-exists", e);
    }
  }
  if (checked) throw new HttpError(400, "Este número não tem WhatsApp");
  return phone; // Z-API não respondeu: tenta mesmo assim
}

export async function startConversation(user: StaffUser, rawPhone: string, text: string, nameHint?: string) {
  const typed = normalizePhone(rawPhone);
  if (typed.length < 12 || typed.length > 13) throw new HttpError(400, "Número inválido. Use DDD + número.");
  if (!text.trim()) throw new HttpError(400, "Escreva a primeira mensagem");
  const phone = await resolveWhatsappPhone(typed);

  const contactRef = db().doc(`contacts/${phone}`);
  const counterRef = db().doc("meta/counters");
  const now = Date.now();

  const { ticketId, created } = await db().runTransaction(async (tx) => {
    const cs = await tx.get(contactRef);
    const c = cs.data() as Contact | undefined;
    const activeRef = c?.activeTicketId ? ticketRef(c.activeTicketId) : null;
    const activeSnap = activeRef ? await tx.get(activeRef) : null;
    const counterSnap = await tx.get(counterRef);

    const active = activeSnap?.exists ? (activeSnap.data() as Ticket) : null;
    if (activeRef && active && active.status !== "closed") {
      if (active.status === "open" && active.assignedTo !== user.uid && user.role !== "admin")
        throw new HttpError(409, `Este cliente já está em atendimento com ${active.assignedName}`);
      if (active.status === "waiting")
        tx.update(activeRef, { status: "open", assignedTo: user.uid, assignedName: user.name, assignedAt: now, awaitingCustomerSince: null });
      return { ticketId: activeRef.id, created: false };
    }

    const name = (c?.saved && c?.name) || nameHint?.trim() || c?.name || phone;
    const ref = db().collection("tickets").doc();
    const tk: Omit<Ticket, "id"> = {
      protocol: nextProtocol(tx, counterSnap),
      phone,
      contactName: name,
      contactPhoto: c?.photo ?? null,
      status: "open",
      assignedTo: user.uid,
      assignedName: user.name,
      createdAt: now,
      assignedAt: now,
      lastMessageAt: now,
      lastMessagePreview: "",
      lastMessageFromMe: true,
      awaitingCustomerSince: null,
      unread: 0,
    };
    tx.set(ref, tk);
    tx.set(
      contactRef,
      {
        phone,
        name,
        activeTicketId: ref.id,
        lastTicketId: ref.id,
        menu: { pendingSince: null, pending: [], financeAt: null },
      },
      { merge: true }
    );
    return { ticketId: ref.id, created: true };
  });

  if (created) await addSystemNote(ticketRef(ticketId), `${user.name} iniciou a conversa`);
  await agentSend(ticketId, user, { type: "text", text: text.trim() });
  return { ticketId };
}

/* ---------- Menu inicial: tipos e helpers ---------- */

const MENU_TTL = 30 * 60_000; // menu sem resposta expira em 30 min

type PendingMessage = ReturnType<typeof parseContent> & { id: string; createdAt: number };
type MenuState = { pendingSince?: number | null; pending?: PendingMessage[]; financeAt?: number | null };

export type ReceivedResult = {
  action: "none" | "welcome" | "menu" | "invalid" | "finance";
  ticketId?: string;
  isNew?: boolean;
  name?: string;
  firstText?: string;
};

function parseChoice(text: string, s0?: Settings): "service" | "finance" | null {
  const norm = (v: string) =>
    (v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (s0) {
    if (s0.menuOption1Label && norm(text) === norm(s0.menuOption1Label)) return "service";
    if (s0.menuOption2Label && norm(text) === norm(s0.menuOption2Label)) return "finance";
  }
  const s = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_.)\-]/g, " ")
    .trim();
  if (/^((opcao|op)\s*)?1\b/.test(s) || /^atendimento\b/.test(s)) return "service";
  if (/^((opcao|op)\s*)?2\b/.test(s) || /^financ/.test(s)) return "finance";
  return null;
}

/** Envia direto pelo WhatsApp, sem registrar em atendimento (menu e financeiro). */
async function sendLoose(phone: string, text: string) {
  if (!text.trim()) return;
  await zapi.sendText(phone, text);
}

/** Envia o menu no estilo configurado; se botões/lista falharem, cai para o texto. */
async function sendMenu(phone: string, s: Settings, name?: string) {
  const o1 = s.menuOption1Label || "Atendimento";
  const o2 = s.menuOption2Label || "Financeiro";
  const msg = renderTemplate(s.menuButtonsMessage || s.menuMessage, { nome: name });
  try {
    if (s.menuStyle === "buttons")
      return void (await zapi.sendButtons(phone, msg, [
        { id: "1", label: o1 },
        { id: "2", label: o2 },
      ]));
    if (s.menuStyle === "list")
      return void (await zapi.sendOptionList(phone, msg, "Escolher assunto", [
        { id: "1", title: o1 },
        { id: "2", title: o2 },
      ]));
  } catch (e) {
    console.error("Botões/lista falharam, enviando menu em texto", e);
  }
  await sendLoose(phone, renderTemplate(s.menuMessage, { nome: name }));
}

/** Ações automáticas depois de registrar a mensagem recebida. */
export async function afterReceived(phone: string, r: ReceivedResult | null) {
  if (!r) return;
  if (r.action === "welcome" && r.ticketId) return sendWelcome(r.ticketId);
  if (r.action === "none") return;
  const s = await getSettings();
  if (r.action === "menu") return sendMenu(phone, s, r.name);
  if (r.action === "invalid") {
    if (s.menuStyle === "text") return sendLoose(phone, renderTemplate(s.menuInvalidMessage, { nome: r.name }));
    return sendMenu(phone, { ...s, menuButtonsMessage: "Por favor, toque em uma das opções abaixo 👇" }, r.name);
  }
  if (r.action === "finance") {
    const fin = normalizePhone(s.financeWhatsapp || "");
    const link = fin ? `https://wa.me/${fin}` : "";
    const finText = renderTemplate(s.financeMessage, { nome: r.name, financeiro: link });
    if (r.ticketId) {
      await addSystemNote(ticketRef(r.ticketId), "Direcionado ao Financeiro — atendimento encerrado");
      await sendOutbound({ id: r.ticketId, phone }, { type: "text", text: finText }, { source: "bot", startTimer: false });
    } else await sendLoose(phone, finText);
    if (s.financeNotify && fin && fin !== phone) {
      await sendLoose(
        fin,
        renderTemplate(s.financeNotifyMessage, {
          nome: r.name,
          nomeCompleto: true,
          telefone: `https://wa.me/${phone}`,
          mensagem: r.firstText || "—",
        })
      ).catch((e) => console.error("Falha ao avisar o financeiro", e));
    }
  }
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
