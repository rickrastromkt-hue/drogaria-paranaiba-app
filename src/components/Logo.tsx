"use client";

import { useEffect, useRef, useState } from "react";

/** Usa /logo.png (logo da farmácia). Se não existir, cai no /logo.svg provisório. */
export function Logo({ className = "h-9" }: { className?: string }) {
  const [src, setSrc] = useState("/logo.png");
  const img = useRef<HTMLImageElement>(null);

  // O erro pode acontecer antes da hidratação do React; checa no mount também.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setSrc("/logo.svg");
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt="Logo"
      className={`${className} w-auto object-contain`}
      onError={() => setSrc("/logo.svg")}
    />
  );
}
