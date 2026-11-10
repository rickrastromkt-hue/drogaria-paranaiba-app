import { HttpError, handler, readJson, requireStaff } from "@/lib/api";
import { adminDb } from "@/lib/firebase-admin";
import { UFS, isValidCpf, normalizePhone, onlyDigits } from "@/lib/br";
import type { Contact } from "@/lib/types";

type Body = { phone?: string; name?: string; city?: string; uf?: string; cpf?: string };

/** Cria ou atualiza um contato salvo. */
export const POST = handler(async (req: Request) => {
  const user = await requireStaff(req);
  const b = await readJson<Body>(req);

  const phone = normalizePhone(b.phone || "");
  if (phone.length < 12 || phone.length > 13) throw new HttpError(400, "WhatsApp inválido. Use DDD + número.");
  const name = (b.name || "").trim().slice(0, 120);
  if (!name) throw new HttpError(400, "Informe o nome");
  const uf = (b.uf || "").toUpperCase().trim();
  if (uf && !UFS.includes(uf)) throw new HttpError(400, "UF inválida");
  const cpf = onlyDigits(b.cpf || "");
  if (cpf && !isValidCpf(cpf)) throw new HttpError(400, "CPF inválido");
  const city = (b.city || "").trim().slice(0, 80);

  const db = adminDb();
  const ref = db.doc(`contacts/${phone}`);
  const now = Date.now();

  const activeTicketId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data() as Contact | undefined;
    tx.set(
      ref,
      {
        phone,
        name,
        city: city || null,
        uf: uf || null,
        cpf: cpf || null,
        saved: true,
        savedAt: prev?.savedAt ?? now,
        updatedAt: now,
        updatedByName: user.name,
      },
      { merge: true }
    );
    return prev?.activeTicketId || null;
  });

  // Atualiza o nome no atendimento em andamento.
  if (activeTicketId) await db.doc(`tickets/${activeTicketId}`).update({ contactName: name }).catch(() => {});
  return { ok: true, phone };
});
