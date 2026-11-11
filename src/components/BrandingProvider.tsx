"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_BRANDING, brandingCssVars, mergeBranding, type Branding } from "@/lib/branding";

export const BRANDING_CACHE_KEY = "branding-cache-v1";

type Ctx = { branding: Branding; refresh: () => Promise<void>; preview: (b: Partial<Branding> | null) => void };
const BrandingContext = createContext<Ctx>({ branding: DEFAULT_BRANDING, refresh: async () => {}, preview: () => {} });

function apply(b: Branding) {
  const vars = brandingCssVars(b);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // favicon
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = b.icon || b.logo || "/logo-default.svg";
  return vars;
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Branding>(DEFAULT_BRANDING);
  const [draft, setDraft] = useState<Partial<Branding> | null>(null);
  const branding = draft ? mergeBranding({ ...saved, ...draft }) : saved;

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/branding", { cache: "no-store" });
      const b = mergeBranding(await r.json());
      setSaved(b);
      try {
        localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ branding: b, vars: brandingCssVars(b) }));
      } catch {}
    } catch {}
  }, []);

  // Service worker em todas as páginas (inclusive login): app instalável e notificações.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY) || "null");
      if (c?.branding) setSaved(mergeBranding(c.branding));
    } catch {}
    refresh();
  }, [refresh]);

  useEffect(() => {
    apply(branding);
  }, [branding]);

  return <BrandingContext.Provider value={{ branding, refresh, preview: setDraft }}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);

/** Script inline: aplica as cores em cache antes da primeira pintura (evita "piscar" a cor padrão). */
export const brandingBootScript = `try{var c=JSON.parse(localStorage.getItem("${BRANDING_CACHE_KEY}"));if(c&&c.vars){for(var k in c.vars)document.documentElement.style.setProperty(k,c.vars[k])}}catch(e){}`;
