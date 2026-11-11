"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, RotateCcw, SendHorizontal, X } from "lucide-react";

type Props = {
  onSend: (photo: Blob, caption: string) => Promise<void>;
  onClose: () => void;
};

/** Tira uma foto com a câmera do computador/celular e envia. */
export function CameraCapture({ onSend, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  useEffect(() => {
    if (photo) return;
    let cancelled = false;
    (async () => {
      try {
        stop();
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
        setError("");
      } catch {
        setError("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, photo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    stop();
    if (photo) URL.revokeObjectURL(photo.url);
    onClose();
  }

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1); // câmera frontal: salva como o espelho que a pessoa vê
    }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (!blob) return;
        stop();
        setPhoto({ blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.88
    );
  }

  function retake() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  }

  async function send() {
    if (!photo) return;
    setBusy(true);
    try {
      await onSend(photo.blob, caption.trim());
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar a foto");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/90 backdrop-blur-sm" style={{ animation: "fadeIn .15s ease-out" }}>
      <div className="flex items-center justify-between p-3 text-white">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4" /> {photo ? "Conferir foto" : "Tirar foto"}
        </span>
        <button onClick={close} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white" title="Fechar (Esc)">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="" className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
        ) : (
          <video
            ref={video}
            playsInline
            muted
            className={`max-h-full max-w-full rounded-xl bg-black object-contain shadow-2xl ${facing === "user" ? "-scale-x-100" : ""}`}
          />
        )}
        {error && <p className="absolute bottom-4 rounded-lg bg-black/60 px-3 py-2 text-sm text-white">{error}</p>}
      </div>

      <div className="p-4">
        {photo ? (
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <button onClick={retake} disabled={busy} className="rounded-full p-3 text-white/80 hover:bg-white/10" title="Tirar outra">
              <RotateCcw className="h-5 w-5" />
            </button>
            <input
              autoFocus
              className="input flex-1 border-white/10 bg-white/95"
              placeholder="Legenda (opcional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button onClick={send} disabled={busy} className="btn btn-primary h-[42px] w-[42px] p-0" title="Enviar">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-8">
            <span className="w-11" />
            <button
              onClick={shoot}
              disabled={!!error}
              className="h-16 w-16 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 active:scale-95 disabled:opacity-40"
              title="Tirar foto"
            />
            {canSwitch ? (
              <button
                onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
                className="rounded-full p-3 text-white/80 hover:bg-white/10"
                title="Trocar câmera"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            ) : (
              <span className="w-11" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
