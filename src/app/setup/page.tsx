"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { Logo } from "@/components/Logo";

export default function SetupPage() {
  const router = useRouter();
  const [needed, setNeeded] = useState<boolean | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setNeeded(!!d.needed))
      .catch(() => setNeeded(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Erro ao criar administrador");
      setBusy(false);
      return;
    }
    await signInWithEmailAndPassword(auth(), form.email.trim(), form.password);
    router.replace("/configuracoes");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sky-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-16" />
          <h1 className="text-xl font-semibold">Configuração inicial</h1>
        </div>
        {needed === null ? (
          <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>
        ) : !needed ? (
          <div className="card p-6 text-center text-sm text-slate-600">
            O sistema já tem um administrador. <a href="/login" className="font-medium text-brand-700">Ir para o login</a>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <p className="text-sm text-slate-500">Crie a conta do administrador. Depois ele cadastra a equipe.</p>
            <div>
              <label className="label">Nome</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Senha</label>
              <input className="input" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar administrador
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
