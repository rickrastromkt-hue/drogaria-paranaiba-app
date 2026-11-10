/** Identidade visual da empresa (white-label). Guardada em Firestore: settings/branding. */

export interface Branding {
  companyName: string;
  slogan: string;
  /** data URL (PNG) do logo completo — usado no login */
  logo: string | null;
  /** data URL (PNG) quadrado — barra lateral, favicon, notificações */
  icon: string | null;
  /** cor principal (botões, abas, mensagens enviadas) */
  primaryColor: string;
  /** cor de destaque (fila, alertas, contadores) */
  accentColor: string;
}

export const DEFAULT_BRANDING: Branding = {
  companyName: "Minha Empresa",
  slogan: "",
  logo: null,
  icon: null,
  primaryColor: "#2563eb",
  accentColor: "#e11d48",
};

export const DEFAULT_LOGO = "/logo-default.svg";

/* ---------- Paleta gerada a partir de uma cor ---------- */

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(rgb: [number, number, number], target: number, amount: number) {
  const c = rgb.map((v) => Math.round(v + (target - v) * amount));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** brand: a cor escolhida vira o tom 600 (botões). */
const BRAND_STEPS: [string, number, number][] = [
  ["50", 255, 0.94], ["100", 255, 0.88], ["200", 255, 0.75], ["300", 255, 0.56], ["400", 255, 0.34],
  ["500", 255, 0.14], ["600", 0, 0], ["700", 0, 0.15], ["800", 0, 0.3], ["900", 0, 0.45],
];
/** accent: a cor escolhida vira o tom 500. */
const ACCENT_STEPS: [string, number, number][] = [
  ["50", 255, 0.94], ["100", 255, 0.87], ["200", 255, 0.74], ["500", 0, 0], ["600", 0, 0.12], ["700", 0, 0.26],
];

export function brandingCssVars(b: Pick<Branding, "primaryColor" | "accentColor">): Record<string, string> {
  const vars: Record<string, string> = {};
  const p = hexToRgb(b.primaryColor) || hexToRgb(DEFAULT_BRANDING.primaryColor)!;
  const a = hexToRgb(b.accentColor) || hexToRgb(DEFAULT_BRANDING.accentColor)!;
  for (const [k, t, amt] of BRAND_STEPS) vars[`--color-brand-${k}`] = mix(p, t, amt);
  for (const [k, t, amt] of ACCENT_STEPS) vars[`--color-accent-${k}`] = mix(a, t, amt);
  return vars;
}

export function mergeBranding(data?: Partial<Branding> | null): Branding {
  const b = { ...DEFAULT_BRANDING, ...(data || {}) };
  if (!b.companyName?.trim()) b.companyName = DEFAULT_BRANDING.companyName;
  return b;
}
