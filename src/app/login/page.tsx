"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Credit } from "@/components/Credit";
import { useBranding } from "@/components/BrandingProvider";

export default function LoginPage() {
  const router = useRouter();
  const { staff, user, loading } = useAuth();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    if (!loading && staff?.active) router.replace("/atendimentos");
  }, [loading, staff, router]);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setSetupNeeded(!!d.needed))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await signInWithEmailAndPassword(auth(), email.trim(), password);
    } catch {
      setError("E-mail ou senha incorretos.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email) return setError("Digite seu e-mail para recuperar a senha.");
    try {
      await sendPasswordResetEmail(auth(), email.trim());
      setInfo("Enviamos um link de redefinição para o seu e-mail.");
      setError("");
    } catch {
      setError("Não foi possível enviar o e-mail de redefinição.");
    }
  }

  const blocked = !loading && user && (!staff || !staff.active);

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-accent-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="h-24" />
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Central de Atendimento</h1>
            <p className="text-sm text-slate-500">{branding.slogan || `${branding.companyName} · atendimento no WhatsApp`}</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          {blocked && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Seu usuário não tem acesso ou foi desativado. Fale com o administrador.
            </p>
          )}
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Senha</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {info && <p className="text-sm text-brand-700">{info}</p>}
          <button className="btn btn-primary w-full py-2.5" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
          </button>
          <button type="button" onClick={reset} className="w-full text-center text-xs text-slate-500 hover:text-brand-700">
            Esqueci minha senha
          </button>
        </form>

        {setupNeeded && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Primeiro acesso?{" "}
            <Link href="/setup" className="font-medium text-brand-700 hover:underline">
              Criar administrador
            </Link>
          </p>
        )}
      </div>
      <Credit className="absolute inset-x-0 bottom-4 text-center" />
    </main>
  );
}
