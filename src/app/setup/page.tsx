"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { Logo } from "@/components/Logo";
import { Credit } from "@/components/Credit";

export default function SetupPage() {
  const router = useRouter();
  const [needed, setNeeded] = useState<boolean | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetch("/api/setup")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro no servidor");
        setNeeded(!!d.needed);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Erro no servidor"));
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
    <main className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-24" />
          <h1 className="text-xl font-semibold">Configuração inicial</h1>
        </div>
        {loadError ? (
          <div className="card space-y-2 p-6 text-sm text-slate-600">
            <p className="font-medium text-accent-600">O servidor não conseguiu acessar o Firebase.</p>
            <p>Confira as variáveis FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (conta de serviço).</p>
            <p className="break-all text-xs text-slate-400">{loadError}</p>
          </div>
        ) : needed === null ? (
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
      <Credit className="absolute inset-x-0 bottom-4 text-center" />
    </main>
  );
}
