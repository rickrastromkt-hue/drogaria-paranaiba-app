export type Role = "admin" | "agent";

export interface StaffUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

export type TicketStatus = "waiting" | "open" | "closed";
export type ClosedBy = "agent" | "inactivity";

export interface Ticket {
  id: string;
  protocol: number;
  phone: string;
  contactName: string;
  contactPhoto: string | null;
  status: TicketStatus;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: number;
  assignedAt: number | null;
  closedAt?: number | null;
  closedBy?: ClosedBy | null;
  closedByName?: string | null;
  lastMessageAt: number;
  lastMessagePreview: string;
  lastMessageFromMe: boolean;
  /** Momento da última mensagem da farmácia sem resposta do cliente (base do auto-encerramento). */
  awaitingCustomerSince: number | null;
  unread: number;
}

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "system"
  | "other";

/** customer = cliente | agent = atendente pelo sistema | bot = resposta automática | phone = enviada direto do celular | system = nota interna */
export type MessageSource = "customer" | "agent" | "bot" | "phone" | "system";

export type MessageStatus = "pending" | "sent" | "received" | "read" | "played" | "failed";

export interface Message {
  id: string;
  source: MessageSource;
  type: MessageType;
  text: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  agentUid?: string | null;
  agentName?: string | null;
  status?: MessageStatus | null;
  createdAt: number;
}

export interface Settings {
  welcomeMessage: string;
  assignedMessage: string;
  closedMessage: string;
  inactivityMessage: string;
  autoCloseMinutes: number;
  signMessages: boolean;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

export const DEFAULT_SETTINGS: Settings = {
  welcomeMessage:
    "Olá, {nome}! 👋 Bem-vindo(a) à nossa farmácia.\nSeu protocolo é *{protocolo}*. Em instantes um de nossos atendentes vai falar com você. 💊",
  assignedMessage: "Oi, {nome}! Aqui é {atendente}, vou continuar seu atendimento. Como posso ajudar?",
  closedMessage:
    "Atendimento *{protocolo}* finalizado. Obrigado pelo contato, {nome}! Qualquer coisa é só chamar. 💚",
  inactivityMessage:
    "Como não tivemos retorno, o atendimento *{protocolo}* foi encerrado. Se precisar, é só mandar uma nova mensagem. 💚",
  autoCloseMinutes: 10,
  signMessages: true,
};

export function renderTemplate(
  tpl: string,
  vars: { nome?: string; atendente?: string; protocolo?: number | string }
): string {
  const firstName = (vars.nome || "").trim().split(/\s+/)[0] || "";
  return tpl
    .replace(/\{nome\}/g, firstName)
    .replace(/\{atendente\}/g, vars.atendente || "")
    .replace(/\{protocolo\}/g, vars.protocolo != null ? String(vars.protocolo) : "")
    .replace(/ +([,!.?])/g, "$1")
    .trim();
}
