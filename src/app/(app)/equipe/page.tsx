"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/client";
import { useTeam } from "@/lib/hooks";
import type { Role, StaffUser } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";

export default function EquipePage() {
  const { staff } = useAuth();
  const team = useTeam();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "agent" as Role });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (staff?.role !== "admin") return <p className="p-6 text-sm text-slate-500">Apenas administradores.</p>;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run("create", () => api("/api/team", form));
    if (ok) {
      setForm({ name: "", email: "", password: "", role: "agent" });
      setShowForm(false);
    }
  }

  const patch = (u: StaffUser, body: Record<string, unknown>) => run(u.uid, () => api(`/api/team/${u.uid}`, body, "PATCH"));

  function resetPassword(u: StaffUser) {
    const password = prompt(`Nova senha para ${u.name} (mín. 6 caracteres):`);
    if (password) patch(u, { password });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Equipe</h1>
            <p className="text-sm text-slate-500">Quem pode entrar e atender os clientes</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? "Cancelar" : "Novo atendente"}
          </button>
        </div>

        {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}

        {showForm && (
          <form onSubmit={create} className="card mb-5 grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="label">Nome</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Senha inicial</label>
              <input className="input" type="text" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div>
              <label className="label">Perfil</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="agent">Atendente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button className="btn btn-primary" disabled={busy === "create"}>
                {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" />} Cadastrar
              </button>
            </div>
          </form>
        )}

        <div className="card divide-y divide-slate-100">
          {team.map((u) => (
            <div key={u.uid} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${u.active ? "" : "opacity-60"}`}>
              <Avatar name={u.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {u.name}
                  {u.role === "admin" && (
                    <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {!u.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Inativo</span>}
                </div>
                <div className="truncate text-sm text-slate-500">{u.email}</div>
              </div>
              <div className="flex items-center gap-1">
                {busy === u.uid && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={u.role}
                  disabled={u.uid === staff.uid}
                  onChange={(e) => patch(u, { role: e.target.value })}
                >
                  <option value="agent">Atendente</option>
                  <option value="admin">Administrador</option>
                </select>
                <button className="btn btn-ghost px-2.5" title="Redefinir senha" onClick={() => resetPassword(u)}>
                  <KeyRound className="h-4 w-4" />
                </button>
                {u.uid !== staff.uid && (
                  <button className={`btn ${u.active ? "btn-danger" : "btn-soft"} px-3`} onClick={() => patch(u, { active: !u.active })}>
                    {u.active ? "Desativar" : "Reativar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
