"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { DEFAULT_LOGO, type Branding } from "@/lib/branding";
import { useBranding } from "./BrandingProvider";

/** Lê uma imagem e reduz para caber em maxW×maxH, devolvendo data URL PNG. */
async function resizeImage(file: File, maxW: number, maxH: number, square = false): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = square ? Math.max(w, h) : w;
    canvas.height = square ? Math.max(w, h) : h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImagePicker({
  label,
  hint,
  value,
  onChange,
  max,
  square,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (v: string | null) => void;
  max: [number, number];
  square?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 ${square ? "h-20 w-20" : "h-20 w-48"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value || DEFAULT_LOGO} alt="" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="button" className="btn btn-soft px-3 py-1.5 text-xs" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />} Enviar imagem
          </button>
          {value && (
            <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange(null)}>
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setError("");
            try {
              const data = await resizeImage(f, max[0], max[1], square);
              if (data.length > 400_000) throw new Error("Imagem muito grande mesmo após reduzir. Use um arquivo mais simples.");
              onChange(data);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não foi possível ler a imagem");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
      {error && <p className="mt-1 text-xs text-accent-600">{error}</p>}
    </div>
  );
}

export function BrandingForm({ password }: { password: string }) {
  const { branding, refresh, preview } = useBranding();
  const [form, setForm] = useState<Branding>(branding);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dirty) setForm(branding);
  }, [branding, dirty]);

  // pré-visualização ao vivo enquanto edita; desfaz ao sair da página
  useEffect(() => () => preview(null), [preview]);

  function set<K extends keyof Branding>(k: K, v: Branding[K]) {
    const next = { ...form, [k]: v };
    setForm(next);
    setDirty(true);
    preview(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/branding", { ...form, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
      setSaving(false);
      return;
    }
    await refresh();
    preview(null);
    setDirty(false);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function reset() {
    preview(null);
    setDirty(false);
    setForm(branding);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nome da empresa</label>
          <input className="input" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} required />
          <p className="mt-1 text-xs text-slate-400">Usado nas mensagens com {"{empresa}"} e no título do sistema.</p>
        </div>
        <div>
          <label className="label">Slogan (opcional)</label>
          <input className="input" value={form.slogan} onChange={(e) => set("slogan", e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">Aparece no login e nas mensagens com {"{slogan}"}.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePicker
          label="Logo completo"
          hint="Tela de login. PNG com fundo transparente fica melhor."
          value={form.logo}
          onChange={(v) => set("logo", v)}
          max={[640, 260]}
        />
        <ImagePicker
          label="Ícone (quadrado)"
          hint="Barra lateral, aba do navegador e notificações."
          value={form.icon}
          onChange={(v) => set("icon", v)}
          max={[512, 512]}
          square
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([
          ["primaryColor", "Cor principal", "Botões, abas e mensagens enviadas"],
          ["accentColor", "Cor de destaque", "Fila, alertas e contadores"],
        ] as const).map(([k, label, hint]) => (
          <div key={k}>
            <label className="label">{label}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-[42px] w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
              <input
                className="input font-mono uppercase"
                value={form[k]}
                maxLength={7}
                onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && set(k, e.target.value)}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
        <span className="text-xs font-medium text-slate-500">Prévia:</span>
        <span className="btn btn-primary px-3 py-1.5 text-xs">Botão</span>
        <span className="btn btn-soft px-3 py-1.5 text-xs">Secundário</span>
        <span className="rounded-full bg-accent-500 px-2 text-[11px] font-semibold leading-5 text-white">3</span>
        <span className="rounded-2xl rounded-br-md bg-brand-100/80 px-3 py-1.5 text-xs text-slate-700">Mensagem enviada</span>
      </div>

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-sm text-accent-600">{error}</span>}
        {saved && <span className="text-sm text-brand-700">Salvo!</span>}
        {dirty && (
          <button type="button" className="btn btn-ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Desfazer
          </button>
        )}
        <button className="btn btn-primary" disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar identidade
        </button>
      </div>
    </form>
  );
}
