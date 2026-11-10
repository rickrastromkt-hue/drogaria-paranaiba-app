"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { BookUser, History, Loader2, LogOut, MessageCircle, Settings, Users } from "lucide-react";
import { db } from "@/lib/firebase";
import { api, playNotification } from "@/lib/client";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Credit } from "@/components/Credit";
import { Avatar } from "@/components/Avatar";

const NAV = [
  { href: "/atendimentos", label: "Conversas", icon: MessageCircle },
  { href: "/contatos", label: "Contatos", icon: BookUser },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/equipe", label: "Equipe", icon: Users, admin: true },
  { href: "/configuracoes", label: "Ajustes", icon: Settings, admin: true },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { staff, user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(0);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!loading && (!user || !staff?.active)) router.replace("/login");
  }, [loading, user, staff, router]);

  // Fila: contador + bipe/notificação quando chega cliente novo.
  useEffect(() => {
    if (!staff?.active) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    const q = query(collection(db(), "tickets"), where("status", "==", "waiting"));
    return onSnapshot(q, (snap) => {
      setWaiting(snap.size);
      const ids = new Set(snap.docs.map((d) => d.id));
      if (known.current) {
        const fresh = snap.docs.filter((d) => !known.current!.has(d.id));
        if (fresh.length) {
          playNotification();
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            const t = fresh[0].data();
            new Notification("Novo cliente na fila", { body: `${t.contactName}: ${t.lastMessagePreview}`, icon: "/icon.png" });
          }
        }
      }
      known.current = ids;
    });
  }, [staff?.active]);

  // Nova mensagem do cliente nos MEUS atendimentos → som + notificação.
  const lastSeen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!staff?.uid || !staff.active) return;
    lastSeen.current = null;
    const q = query(collection(db(), "tickets"), where("assignedTo", "==", staff.uid));
    return onSnapshot(q, (snap) => {
      const map = new Map<string, number>();
      let notify: { contactName: string; lastMessagePreview: string } | null = null;
      for (const d of snap.docs) {
        const t = d.data();
        if (t.status !== "open") continue;
        map.set(d.id, t.lastMessageAt);
        const before = lastSeen.current?.get(d.id);
        if (lastSeen.current && !t.lastMessageFromMe && (before === undefined ? false : t.lastMessageAt > before))
          notify = { contactName: t.contactName, lastMessagePreview: t.lastMessagePreview };
      }
      if (notify) {
        playNotification();
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden)
          new Notification(notify.contactName, { body: notify.lastMessagePreview, icon: "/icon.png" });
      }
      lastSeen.current = map;
    });
  }, [staff?.uid, staff?.active]);

  // Encerramento automático por ausência: o painel aberto dispara a verificação a cada minuto.
  useEffect(() => {
    if (!staff?.active) return;
    const run = () => api("/api/cron/auto-close").catch(() => {});
    run();
    const t = setInterval(run, 60_000);
    return () => clearInterval(t);
  }, [staff?.active]);

  useEffect(() => {
    document.title = waiting ? `(${waiting}) Atendimento · Drogaria Paranaíba` : "Atendimento · Drogaria Paranaíba";
  }, [waiting]);

  if (loading || !staff?.active)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );

  const items = NAV.filter((n) => !n.admin || staff.role === "admin");

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-[84px] shrink-0 flex-col items-center border-r border-slate-200/70 bg-white py-4 md:flex">
        <Link href="/atendimentos" className="mb-6 px-2">
          <Logo variant="icon" className="h-11" />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
                {href === "/atendimentos" && waiting > 0 && (
                  <span className="absolute right-2 top-1.5 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[10px] leading-[18px] text-white">
                    {waiting}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col items-center gap-2">
          <div title={`${staff.name} (${staff.role === "admin" ? "Administrador" : "Atendente"})`}>
            <Avatar name={staff.name} size={36} />
          </div>
          <button onClick={logout} title="Sair" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      <nav className="flex shrink-0 border-t border-slate-200 bg-white md:hidden">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-brand-700" : "text-slate-500"}`}>
              <Icon className="h-5 w-5" />
              {label}
              {href === "/atendimentos" && waiting > 0 && (
                <span className="absolute right-[calc(50%-20px)] top-1 rounded-full bg-accent-500 px-1.5 text-[10px] text-white">{waiting}</span>
              )}
            </Link>
          );
        })}
        <button onClick={logout} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500">
          <LogOut className="h-5 w-5" /> Sair
        </button>
      </nav>
    </div>
  );
}
