"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, Loader2, Lock, X } from "lucide-react";
import { api } from "@/lib/client";
import { BrandingForm } from "./BrandingForm";

/** Link discreto "Ajuste do desenvolvedor": pede a senha e libera a identidade da empresa. */
export function DevSettings() {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (password) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [password]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/dev/verify", { password: typed });
      setPassword(typed);
      setAsking(false);
      setTyped("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senha incorreta");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {password ? (
        <section ref={panel} className="card border-dashed p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <Code2 className="h-4 w-4 text-slate-400" /> Ajuste do desenvolvedor · Empresa
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">Nome, logo e cores do sistema. As mudanças aparecem na hora para você conferir antes de salvar.</p>
            </div>
            <button onClick={() => setPassword(null)} className="btn btn-ghost px-2.5 py-1.5 text-xs" title="Bloquear">
              <Lock className="h-3.5 w-3.5" /> Bloquear
            </button>
          </div>
          <BrandingForm password={password} />
        </section>
      ) : (
        <div className="flex justify-center pt-2">
          <button onClick={() => setAsking(true)} className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-600">
            <Code2 className="h-3.5 w-3.5" /> Ajuste do desenvolvedor
          </button>
        </div>
      )}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/25 p-4 pt-[18vh] backdrop-blur-[1px]" onClick={() => setAsking(false)}>
          <form onSubmit={unlock} className="card w-full max-w-xs space-y-4 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <Lock className="h-4 w-4 text-slate-400" /> Ajuste do desenvolvedor
              </h2>
              <button type="button" onClick={() => setAsking(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="label">Senha</label>
              <input autoFocus type="password" autoComplete="off" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} required />
              {error && <p className="mt-1.5 text-xs text-accent-600">{error}</p>}
            </div>
            <button className="btn btn-primary w-full" disabled={busy || !typed}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
            </button>
          </form>
        </div>
      )}
    </>
  );
}
