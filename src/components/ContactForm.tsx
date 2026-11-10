"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { api } from "@/lib/client";
import { UFS, formatCpf, formatPhoneInput, isValidCpf, onlyDigits } from "@/lib/br";
import type { Contact } from "@/lib/types";

type Props = {
  /** Contato existente (edição). Sem ele, é um contato novo. */
  contact?: Partial<Contact> | null;
  /** Telefone fixo (ex.: vindo do atendimento) — não pode ser alterado. */
  lockedPhone?: string;
  onSaved?: (phone: string) => void;
};

export function ContactForm({ contact, lockedPhone, onSaved }: Props) {
  const phoneLocked = !!(lockedPhone || contact?.phone);
  const initial = () => ({
    name: contact?.saved ? contact?.name || "" : contact?.name || contact?.waName || "",
    phone: formatPhoneInput(lockedPhone || contact?.phone || ""),
    city: contact?.city || "",
    uf: contact?.uf || "",
    cpf: formatCpf(contact?.cpf || ""),
  });
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Recarrega quando muda o contato (outro atendimento).
  useEffect(() => {
    setForm(initial());
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.phone, lockedPhone, contact?.updatedAt]);

  const cpfDigits = onlyDigits(form.cpf);
  const cpfInvalid = cpfDigits.length === 11 && !isValidCpf(cpfDigits);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ phone: string }>("/api/contacts", {
        phone: lockedPhone || contact?.phone || form.phone,
        name: form.name,
        city: form.city,
        uf: form.uf,
        cpf: form.cpf,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved?.(r.phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className="label">Nome</label>
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        {contact?.waName && contact.saved && contact.waName !== form.name && (
          <p className="mt-1 text-[11px] text-slate-400">No WhatsApp: {contact.waName}</p>
        )}
      </div>
      <div>
        <label className="label">WhatsApp</label>
        <input
          className="input disabled:bg-slate-50 disabled:text-slate-500"
          inputMode="tel"
          placeholder="(34) 99999-9999"
          value={form.phone}
          disabled={phoneLocked}
          onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
          required
        />
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <div>
          <label className="label">Cidade</label>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label className="label">UF</label>
          <select className="input" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">CPF</label>
        <input
          className={`input ${cpfInvalid ? "border-accent-500 focus:border-accent-500 focus:ring-accent-100" : ""}`}
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={form.cpf}
          onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })}
        />
        {cpfInvalid && <p className="mt-1 text-[11px] text-accent-600">CPF inválido</p>}
      </div>
      {error && <p className="text-sm text-accent-600">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy || cpfInvalid}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saved ? "Salvo!" : contact?.saved ? "Salvar alterações" : "Salvar contato"}
      </button>
    </form>
  );
}
