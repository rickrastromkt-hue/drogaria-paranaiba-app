"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MonitorSmartphone, UserRoundCog, X } from "lucide-react";
import { useTeam } from "@/lib/hooks";
import { ROLE_LABEL, canDelegate } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Avatar } from "./Avatar";

/** Lista para escolher "quem está atendendo agora" (somente administradores). */
function Picker({ onClose }: { onClose: () => void }) {
  const { staff, acting, setActing } = useAuth();
  const team = useTeam().filter((u) => u.active);
  const current = acting?.uid ?? staff?.uid;
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Quem está atendendo?</span>
        <button onClick={onClose} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {team.map((u) => (
          <button
            key={u.uid}
            onClick={() => {
              setActing(u.uid === staff?.uid ? null : u.uid);
              onClose();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${current === u.uid ? "bg-brand-50/60" : ""}`}
          >
            <Avatar name={u.name} size={28} />
            <span className="flex-1 truncate">
              {u.name}
              {u.uid === staff?.uid && <span className="text-slate-400"> (esta conta)</span>}
            </span>
            {current === u.uid && <Check className="h-4 w-4 text-brand-600" />}
          </button>
        ))}
      </div>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-snug text-slate-400">
        Para computador compartilhado: tudo o que fizer (pegar, responder, encerrar) fica registrado no nome escolhido.
      </p>
    </div>
  );
}

/** Avatar da barra lateral: mostra quem está atendendo e abre o seletor (admin). */
export function SidebarIdentity() {
  const { staff, acting } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!staff) return null;
  const me = acting ?? staff;
  const isAdmin = canDelegate(staff.role);
  return (
    <div ref={box} className="relative">
      <button
        disabled={!isAdmin}
        onClick={() => setOpen((v) => !v)}
        title={isAdmin ? `Atendendo como ${me.name} — clique para trocar` : `${staff.name} (${ROLE_LABEL[staff.role]})`}
        className="relative rounded-full disabled:cursor-default"
      >
        <Avatar name={me.name} size={36} />
        {acting && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white">
            <UserRoundCog className="h-2.5 w-2.5" />
          </span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-0 left-full z-50 ml-3">
          <Picker onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Faixa no topo quando a conta está atendendo em nome de outra pessoa (ou convite para escolher). */
export function ActingBar() {
  const { staff, acting, setActing } = useAuth();
  const [open, setOpen] = useState(false);
  if (!canDelegate(staff?.role)) return null;
  return (
    <div className="relative">
      {acting ? (
        <div className="flex items-center justify-center gap-2 border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-800">
          <MonitorSmartphone className="h-3.5 w-3.5" />
          <span>
            Atendendo como <b>{acting.name}</b>
          </span>
          <button onClick={() => setOpen((v) => !v)} className="rounded-md px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline">
            Trocar
          </button>
          <button onClick={() => setActing(null)} className="rounded-md px-1.5 py-0.5 text-brand-600 underline-offset-2 hover:underline">
            Voltar para {staff.name.split(" ")[0]}
          </button>
        </div>
      ) : (
        <div className="flex justify-end px-3 pt-1.5 md:hidden">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] text-slate-400">
            <UserRoundCog className="h-3.5 w-3.5" /> Quem está atendendo?
          </button>
        </div>
      )}
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2">
          <Picker onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
