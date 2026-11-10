"use client";

import { DEFAULT_LOGO } from "@/lib/branding";
import { useBranding } from "./BrandingProvider";

/** Logo da empresa (configurável em Ajustes → Empresa). "full" = logo completo, "icon" = símbolo quadrado. */
export function Logo({ variant = "full", className = "h-9" }: { variant?: "full" | "icon"; className?: string }) {
  const { branding } = useBranding();
  const src = (variant === "icon" ? branding.icon || branding.logo : branding.logo || branding.icon) || DEFAULT_LOGO;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={branding.companyName} className={`${className} w-auto object-contain`} />;
}
