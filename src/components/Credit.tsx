/** Crédito do desenvolvedor, discreto. */
export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 ${className}`}>
      Desenvolvido por <span className="text-slate-500">Mídia para Artistas</span>
    </p>
  );
}
