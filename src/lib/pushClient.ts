"use client";

import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { api } from "./client";
import { app } from "./firebase";

const TOKEN_KEY = "push-token";

export async function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window && (await isSupported().catch(() => false));
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * Inscreve este celular/navegador nas notificações push.
 * ask = true pede permissão (deve ser chamado num clique do usuário).
 */
export async function enablePush(ask = false): Promise<"granted" | "denied" | "default" | "unsupported" | "error"> {
  if (!(await pushSupported())) return "unsupported";
  let perm = Notification.permission;
  if (perm === "default" && ask) perm = await Notification.requestPermission();
  if (perm !== "granted") return perm;
  try {
    const cfg = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json());
    if (!cfg.vapidKey) return "error";
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app()), { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return "error";
    await api("/api/push", { token });
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
    return "granted";
  } catch (e) {
    console.error("push", e);
    return "error";
  }
}

/** Ao sair do sistema: este aparelho para de receber notificações dessa conta. */
export async function disablePush() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) await api("/api/push", { token }, "DELETE").catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    if (await pushSupported()) await deleteToken(getMessaging(app())).catch(() => {});
  } catch {}
}

/** Registra o service worker cedo (necessário para o app ser instalável). */
export function registerServiceWorker() {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) registration().catch(() => {});
}
