"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText, Loader2, Pause, Play, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { duration } from "@/lib/client";

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Baixa direto: tenta no navegador, depois pelo proxy do servidor, e por último abre em nova aba. */
export async function downloadFile(url: string, fileName: string) {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error();
    return saveBlob(await r.blob(), fileName);
  } catch {}
  try {
    const token = await auth().currentUser?.getIdToken();
    const r = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ url, fileName }),
    });
    if (!r.ok) throw new Error();
    return saveBlob(await r.blob(), fileName);
  } catch {}
  window.open(url, "_blank", "noopener");
}

function nameFromUrl(url: string, fallback: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return last.includes(".") ? last.replace(/^\d+-/, "") : fallback;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Imagem + lightbox                                                   */
/* ------------------------------------------------------------------ */

export function ImageMessage({ url, caption }: { url: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-1 block overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-h-72 w-full cursor-zoom-in object-cover transition hover:brightness-95" />
      </button>
      {open && <Lightbox url={url} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ url, caption, onClose }: { url: string; caption?: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function download() {
    setBusy(true);
    await downloadFile(url, nameFromUrl(url, `imagem-${Date.now()}.jpg`));
    setBusy(false);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/85 backdrop-blur-sm"
      style={{ animation: "fadeIn .15s ease-out" }}
      onClick={onClose}
    >
      <div className="flex items-center justify-end gap-1 p-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={download} className="rounded-full p-2.5 text-white/80 transition hover:bg-white/10 hover:text-white" title="Baixar">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-full p-2.5 text-white/80 transition hover:bg-white/10 hover:text-white" title="Abrir em nova aba">
          <ExternalLink className="h-5 w-5" />
        </a>
        <button onClick={onClose} className="rounded-full p-2.5 text-white/80 transition hover:bg-white/10 hover:text-white" title="Fechar (Esc)">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        {!loaded && <Loader2 className="absolute h-8 w-8 animate-spin text-white/60" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          onLoad={() => setLoaded(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full rounded-xl object-contain shadow-2xl transition duration-200 ${loaded ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
        />
      </div>
      {caption && (
        <p className="mx-auto mb-6 max-w-2xl px-4 text-center text-sm text-white/90" onClick={(e) => e.stopPropagation()}>
          {caption}
        </p>
      )}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Áudio                                                               */
/* ------------------------------------------------------------------ */

const BARS = 36;
const SPEEDS = [1, 1.5, 2];

export function AudioPlayer({ url, mine }: { url: string; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);

  // "Onda" decorativa estável por URL.
  const bars = useMemo(() => {
    let h = 0;
    for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Array.from({ length: BARS }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      const wave = Math.sin((i / BARS) * Math.PI) * 0.5 + 0.35;
      return Math.max(0.18, Math.min(1, wave * (0.55 + ((h >>> 16) % 100) / 110)));
    });
  }, [url]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      // pausa outros áudios tocando
      document.querySelectorAll("audio").forEach((el) => el !== a && el.pause());
      setLoading(a.readyState < 3);
      a.play().catch(() => setLoading(false));
    } else a.pause();
  }, []);

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
    setCurrent(a.currentTime);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  const progress = total ? current / total : 0;

  return (
    <div className="flex w-[260px] max-w-full items-center gap-2.5 py-1">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
        onDurationChange={(e) => isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPlaying={() => setLoading(false)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          e.currentTarget.currentTime = 0;
          setCurrent(0);
        }}
      />
      <button
        onClick={toggle}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 ${
          mine ? "bg-brand-600 hover:bg-brand-700" : "bg-accent-500 hover:bg-accent-600"
        }`}
        title={playing ? "Pausar" : "Ouvir"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h * 100}%` }}
              className={`w-[3px] flex-1 rounded-full transition-colors ${
                i / BARS < progress ? (mine ? "bg-brand-600" : "bg-accent-500") : "bg-slate-300"
              }`}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
          <span>{duration((playing || current ? current : total) * 1000)}</span>
          <button onClick={cycleSpeed} className="rounded-full bg-black/5 px-1.5 font-semibold hover:bg-black/10">
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Documento                                                           */
/* ------------------------------------------------------------------ */

function docIcon(ext: string) {
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return FileSpreadsheet;
  if (["zip", "rar", "7z"].includes(ext)) return FileArchive;
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return FileImage;
  return FileText;
}

export function DocumentMessage({ url, fileName }: { url: string; fileName?: string | null }) {
  const [busy, setBusy] = useState(false);
  const name = fileName || nameFromUrl(url, "documento");
  const ext = (name.split(".").pop() || "").toLowerCase();
  const Icon = docIcon(ext);

  async function go() {
    setBusy(true);
    await downloadFile(url, name);
    setBusy(false);
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="mb-1 flex w-[260px] max-w-full items-center gap-3 rounded-xl bg-black/[0.04] px-3 py-2.5 text-left transition hover:bg-black/[0.07]"
      title="Baixar"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-700">{name}</div>
        <div className="text-[11px] uppercase text-slate-400">{ext || "arquivo"}</div>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </div>
    </button>
  );
}
