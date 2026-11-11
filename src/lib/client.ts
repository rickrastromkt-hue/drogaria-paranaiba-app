"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebase";

/** uid de "quem está atendendo" (computador compartilhado); enviado em todas as chamadas. */
let actingHeader: string | null = null;
export function setActingHeader(uid: string | null) {
  actingHeader = uid;
}

export async function api<T = { ok: boolean }>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const token = await auth().currentUser?.getIdToken();
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(actingHeader ? { "X-Acting-As": actingHeader } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Erro inesperado");
  return data as T;
}

/** Re-renderiza a cada `ms` milissegundos (para contadores e "há x min"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relative(ts: number, now: number) {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Som de notificação (public/notificacao.mp3). Limita a 1 toque a cada 1,5 s. */
let notifAudio: HTMLAudioElement | null = null;
let lastPlay = 0;
export function playNotification() {
  try {
    const now = Date.now();
    if (now - lastPlay < 1500) return;
    lastPlay = now;
    notifAudio ??= new Audio("/notificacao.mp3");
    notifAudio.currentTime = 0;
    notifAudio.play().catch(() => {});
  } catch {}
}
