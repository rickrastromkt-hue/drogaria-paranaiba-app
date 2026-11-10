import "server-only";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";
import type { StaffUser } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireStaff(req: Request, opts: { admin?: boolean } = {}): Promise<StaffUser> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Não autenticado");
  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    throw new HttpError(401, "Sessão inválida, faça login novamente");
  }
  const snap = await adminDb().doc(`users/${uid}`).get();
  const user = snap.data() as StaffUser | undefined;
  if (!user || !user.active) throw new HttpError(403, "Usuário sem acesso");
  if (opts.admin && user.role !== "admin") throw new HttpError(403, "Apenas administradores");
  return { ...user, uid };
}

export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const data = await fn(...args);
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      const msg = e instanceof Error ? e.message : "Erro interno";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
