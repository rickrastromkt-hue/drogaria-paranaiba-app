import "server-only";
import { createHash } from "crypto";
import { getMessaging } from "firebase-admin/messaging";
import { adminApp, adminDb } from "./firebase-admin";
import type { StaffUser, Ticket } from "./types";

/** Tokens dos celulares/navegadores: pushTokens/{hash} → { token, uid, updatedAt } */
const tokenId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 40);

export async function saveToken(uid: string, token: string, userAgent?: string | null) {
  await adminDb().doc(`pushTokens/${tokenId(token)}`).set({ token, uid, userAgent: userAgent || null, updatedAt: Date.now() });
}

export async function removeToken(token: string) {
  await adminDb().doc(`pushTokens/${tokenId(token)}`).delete().catch(() => {});
}

export async function getVapidKey(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const d = (await adminDb().doc("settings/push").get()).data();
  return (d?.vapidKey as string) || null;
}

type Payload = { title: string; body: string; url: string; tag?: string };

/** Envia para os usuários indicados (ou toda a equipe ativa, com "all"). */
export async function sendPush(target: string[] | "all", p: Payload) {
  const db = adminDb();
  let uids: string[];
  if (target === "all") {
    const users = await db.collection("users").where("active", "==", true).get();
    uids = users.docs.map((d) => d.id);
  } else {
    uids = [...new Set(target.filter(Boolean))];
  }
  if (!uids.length) return;

  const docs: { id: string; token: string }[] = [];
  for (let i = 0; i < uids.length; i += 30) {
    const s = await db.collection("pushTokens").where("uid", "in", uids.slice(i, i + 30)).get();
    s.docs.forEach((d) => docs.push({ id: d.id, token: d.data().token }));
  }
  if (!docs.length) return;

  const res = await getMessaging(adminApp()).sendEachForMulticast({
    tokens: docs.map((d) => d.token),
    data: { title: p.title, body: p.body.slice(0, 180), url: p.url, tag: p.tag || "" },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
  });
  // Remove tokens que não valem mais (app desinstalado, permissão revogada…)
  await Promise.all(
    res.responses.map((r, i) => {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument"))
        return db.doc(`pushTokens/${docs[i].id}`).delete().catch(() => {});
    })
  );
}

/** Mensagem do cliente chegou: avisa quem deve ver. */
export async function pushForTicket(ticketId: string, kind: "inbound" | "queue" | "assigned", assignee?: StaffUser | null) {
  const snap = await adminDb().doc(`tickets/${ticketId}`).get();
  const t = snap.data() as Ticket | undefined;
  if (!t || t.status === "closed") return;
  const url = `/atendimentos?t=${ticketId}`;
  const preview = t.lastMessagePreview || "";

  if (kind === "assigned" && assignee) {
    return sendPush([assignee.uid], { title: "Atendimento para você", body: `${t.contactName}: ${preview}`, url, tag: `t-${ticketId}` });
  }
  if (t.status === "waiting") {
    return sendPush("all", {
      title: kind === "queue" ? "Novo cliente na fila" : "Nova mensagem na fila",
      body: `${t.contactName}: ${preview}`,
      url,
      tag: `t-${ticketId}`,
    });
  }
  // em atendimento: responsável + participantes
  const targets = [t.assignedTo || "", ...(t.participants || [])];
  return sendPush(targets, { title: t.contactName, body: preview, url, tag: `t-${ticketId}` });
}
