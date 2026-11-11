"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, SendHorizontal, Trash2 } from "lucide-react";
import { duration } from "@/lib/client";

const MAX_SECONDS = 5 * 60;

/** Converte as amostras gravadas em MP3 (formato aceito em qualquer WhatsApp). */
async function toMp3(chunks: Float32Array[], sampleRate: number): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, sampleRate, 48); // voz: 48 kbps (5 min ≈ 1,8 MB)
  const parts: Uint8Array[] = [];
  const FRAME = 1152;
  let pending = new Int16Array(0);
  for (const c of chunks) {
    const pcm = new Int16Array(pending.length + c.length);
    pcm.set(pending);
    for (let i = 0; i < c.length; i++) {
      const s = Math.max(-1, Math.min(1, c[i]));
      pcm[pending.length + i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    let i = 0;
    for (; i + FRAME <= pcm.length; i += FRAME) {
      const b = enc.encodeBuffer(pcm.subarray(i, i + FRAME));
      if (b.length) parts.push(b);
    }
    pending = pcm.slice(i);
  }
  if (pending.length) parts.push(enc.encodeBuffer(pending));
  parts.push(enc.flush());
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

type Props = {
  /** Chamado com o MP3 pronto para enviar. */
  onSend: (file: Blob) => Promise<void> | void;
  onCancel: () => void;
  onError: (msg: string) => void;
};

/** Barra de gravação (substitui o campo de texto enquanto grava). */
export function VoiceRecorder({ onSend, onCancel, onError }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState<number[]>(Array(28).fill(0.08));
  const [busy, setBusy] = useState(false);
  const chunks = useRef<Float32Array[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const node = useRef<ScriptProcessorNode | null>(null);
  const started = useRef(0);
  const stopped = useRef(false);

  function teardown() {
    stopped.current = true;
    node.current?.disconnect();
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    stopped.current = false;
    chunks.current = [];
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const ac = new AudioContext();
        ctx.current = ac;
        const src = ac.createMediaStreamSource(s);
        const proc = ac.createScriptProcessor(4096, 1, 1);
        node.current = proc;
        proc.onaudioprocess = (e) => {
          if (stopped.current) return;
          const data = e.inputBuffer.getChannelData(0);
          chunks.current.push(new Float32Array(data));
          let sum = 0;
          for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
          const rms = Math.min(1, Math.sqrt(sum / (data.length / 16)) * 4);
          setLevel((l) => [...l.slice(1), Math.max(0.08, rms)]);
        };
        src.connect(proc);
        proc.connect(ac.destination);
        if (ac.state === "suspended") await ac.resume().catch(() => {});
        started.current = Date.now();
      } catch {
        onError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
        onCancel();
      }
    })();
    const t = setInterval(() => {
      if (!started.current) return;
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(s);
    }, 250);
    return () => {
      cancelled = true;
      clearInterval(t);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seconds >= MAX_SECONDS && !busy) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  async function finish() {
    if (busy) return;
    const sampleRate = ctx.current?.sampleRate || 44100;
    teardown();
    if (!chunks.current.length || seconds < 1) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const mp3 = await toMp3(chunks.current, sampleRate);
      await onSend(mp3);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Erro ao gerar o áudio");
    } finally {
      setBusy(false);
      onCancel();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          teardown();
          onCancel();
        }}
        disabled={busy}
        className="rounded-xl p-2.5 text-slate-500 hover:bg-accent-50 hover:text-accent-600"
        title="Descartar"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div className="flex h-[42px] flex-1 items-center gap-3 rounded-xl border border-accent-200 bg-accent-50/60 px-3">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-accent-500" />
        <span className="w-10 shrink-0 text-sm font-medium tabular-nums text-accent-700">{duration(seconds * 1000)}</span>
        <div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
          {level.map((v, i) => (
            <span key={i} className="w-[3px] flex-1 rounded-full bg-accent-500/70 transition-[height]" style={{ height: `${v * 100}%` }} />
          ))}
        </div>
        <span className="hidden text-xs text-accent-600 sm:inline">Gravando…</span>
      </div>
      <button onClick={finish} disabled={busy} className="btn btn-primary h-[42px] w-[42px] p-0" title="Enviar áudio">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
      </button>
    </div>
  );
}
