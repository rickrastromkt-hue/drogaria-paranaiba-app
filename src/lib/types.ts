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
export type ClosedBy = "agent" | "inactivity" | "finance";

export interface Ticket {
  id: string;
  /** Ex.: 20261110-001 (data + sequência do dia). Tickets antigos podem ter número. */
  protocol: string | number;
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

export interface Contact {
  /** Igual ao id do documento: 55 + DDD + número */
  phone: string;
  /** Nome salvo pela equipe (ou o nome do WhatsApp enquanto não for salvo) */
  name: string;
  /** Nome que aparece no perfil do WhatsApp */
  waName?: string | null;
  photo?: string | null;
  city?: string | null;
  uf?: string | null;
  cpf?: string | null;
  saved?: boolean;
  savedAt?: number | null;
  updatedAt?: number | null;
  updatedByName?: string | null;
  lastMessageAt?: number | null;
  activeTicketId?: string | null;
  lastTicketId?: string | null;
}

export interface Settings {
  welcomeMessage: string;
  assignedMessage: string;
  closedMessage: string;
  inactivityMessage: string;
  autoCloseMinutes: number;
  signMessages: boolean;
  /** Menu inicial: pergunta o assunto antes de abrir o atendimento */
  menuEnabled: boolean;
  menuMessage: string;
  menuInvalidMessage: string;
  /** Como o menu é mostrado: texto com números, botões ou lista de opções */
  menuStyle: "text" | "buttons" | "list";
  /** Texto que acompanha os botões/lista */
  menuButtonsMessage: string;
  menuOption1Label: string;
  menuOption2Label: string;
  /** WhatsApp do financeiro (DDD + número) */
  financeWhatsapp: string;
  /** Resposta ao cliente que escolheu Financeiro. {financeiro} = link do WhatsApp do financeiro */
  financeMessage: string;
  /** Também avisar o WhatsApp do financeiro sobre o cliente */
  financeNotify: boolean;
  financeNotifyMessage: string;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

export const DEFAULT_SETTINGS: Settings = {
  welcomeMessage:
    "Perfeito, {nome}! 😊 Seu protocolo é *{protocolo}*.\nEm instantes um de nossos atendentes vai falar com você. 💊",
  assignedMessage: "Oi, {nome}! Aqui é {atendente}, vou continuar seu atendimento. Como posso ajudar?",
  closedMessage:
    "Atendimento *{protocolo}* finalizado. Obrigado pelo contato, {nome}! Nossa tradição é cuidar de você! ❤️",
  inactivityMessage:
    "Como não tivemos retorno, o atendimento *{protocolo}* foi encerrado. Se precisar, é só mandar uma nova mensagem. ❤️",
  autoCloseMinutes: 10,
  signMessages: true,
  menuEnabled: true,
  menuMessage:
    "Olá, {nome}! 👋 Bem-vindo(a) à *Drogaria Paranaíba*.\nSobre qual assunto você quer falar?\n\n*1* - Atendimento (pedidos, preços e medicamentos)\n*2* - Financeiro (boletos, pagamentos e crediário)\n\nResponda com o *número* da opção.",
  menuInvalidMessage: "Não entendi 😅 Responda apenas com *1* para Atendimento ou *2* para Financeiro.",
  menuStyle: "text",
  menuButtonsMessage:
    "Olá, {nome}! 👋 Bem-vindo(a) à *Drogaria Paranaíba*.\nSobre qual assunto você quer falar? Toque em uma opção abaixo:",
  menuOption1Label: "Atendimento",
  menuOption2Label: "Financeiro",
  financeWhatsapp: "",
  financeMessage:
    "Para assuntos financeiros, fale direto com nosso setor *Financeiro* pelo WhatsApp:\n{financeiro}\n\nObrigado, {nome}! ❤️",
  financeNotify: true,
  financeNotifyMessage:
    "💰 *Cliente procurando o Financeiro*\nNome: {nome}\nWhatsApp: {telefone}\nMensagem: {mensagem}",
};

export function renderTemplate(
  tpl: string,
  vars: {
    nome?: string;
    atendente?: string;
    protocolo?: number | string;
    financeiro?: string;
    telefone?: string;
    mensagem?: string;
    nomeCompleto?: boolean;
  }
): string {
  const firstName = vars.nomeCompleto ? (vars.nome || "").trim() : (vars.nome || "").trim().split(/\s+/)[0] || "";
  return tpl
    .replace(/\{financeiro\}/g, vars.financeiro || "")
    .replace(/\{telefone\}/g, vars.telefone || "")
    .replace(/\{nome\}/g, firstName)
    .replace(/\{atendente\}/g, vars.atendente || "")
    .replace(/\{protocolo\}/g, vars.protocolo != null ? String(vars.protocolo) : "")
    .replace(/ +([,!.?])/g, "$1")
    .replace(/\{mensagem\}/g, vars.mensagem || "")
    .trim();
}
