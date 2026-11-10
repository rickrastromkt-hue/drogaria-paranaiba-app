import "server-only";
import { pbkdf2Sync, timingSafeEqual } from "crypto";
import { HttpError } from "./api";

/**
 * Senha do "Ajuste do desenvolvedor" (padrão em todas as instalações).
 * Guardamos só o hash (PBKDF2), nunca a senha em texto.
 * Para trocar numa instalação específica: DEV_PASSWORD_SALT + DEV_PASSWORD_HASH nas variáveis da Vercel.
 */
const SALT = process.env.DEV_PASSWORD_SALT || "de9cdbd4c600ef469769508f8bbcd915";
const HASH = process.env.DEV_PASSWORD_HASH || "4c37d038ce174aeecc0d8b6431941810b5dfe942ada41d0a637bc7238991dcc7";
const ITER = 210_000;

export function isDevPassword(password: unknown): boolean {
  if (typeof password !== "string" || !password) return false;
  const got = pbkdf2Sync(password, SALT, ITER, 32, "sha256");
  const want = Buffer.from(HASH, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function requireDevPassword(password: unknown) {
  if (!isDevPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // dificulta tentativas em série
    throw new HttpError(401, "Senha do desenvolvedor incorreta");
  }
}
