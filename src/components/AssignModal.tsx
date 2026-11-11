"use client";

import { useEffect, useState } from "react";
import { Hand, Loader2, UserRoundCog, X } from "lucide-react";
import type { StaffUser } from "@/lib/types";

type Props = {
  team: StaffUser[];
  title?: string;
  confirmLabel?: string;
  onConfirm: (uid: string) => Promise<void> | void;
  onClose: () => void;
};

/** "Quem vai atender?" — sem ninguém pré-selecionado: é preciso escolher para continuar. */
export function AssignModal({ team, title = "Quem vai atender?", confirmLabel = "Continuar", onConfirm, onClose }: Props) {
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/30 p-0 backdrop-blur-[1px] sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="pb-safe w-full max-w-sm space-y-4 rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        style={{ animation: "toastIn .2s ease-out" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <UserRoundCog className="h-5 w-5 text-brand-600" /> {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div>
          <label className="label">Atendente</label>
          <select autoFocus className="input" value={uid} onChange={(e) => setUid(e.target.value)} required>
            <option value="" disabled>
              Selecione quem vai atender…
            </option>
            {team
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.name}
                </option>
              ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-400">O cliente verá o nome escolhido e o atendimento fica registrado para essa pessoa.</p>
        </div>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <button className="btn btn-primary w-full py-2.5" disabled={!uid || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} {confirmLabel}
        </button>
      </form>
    </div>
  );
}
