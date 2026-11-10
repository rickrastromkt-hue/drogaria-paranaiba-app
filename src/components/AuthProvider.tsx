"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { StaffUser } from "@/lib/types";

type Ctx = { user: User | null; staff: StaffUser | null; loading: boolean; logout: () => Promise<void> };

// Variáveis NEXT_PUBLIC_* são gravadas no build: se faltarem, é preciso fazer um novo deploy.
const CONFIGURED = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const AuthContext = createContext<Ctx>({ user: null, staff: null, loading: true, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!CONFIGURED) return;
    let unsubDoc: (() => void) | undefined;
    const unsub = onAuthStateChanged(auth(), (u) => {
      unsubDoc?.();
      setUser(u);
      if (!u) {
        setStaff(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      unsubDoc = onSnapshot(
        doc(db(), "users", u.uid),
        (snap) => {
          setStaff(snap.exists() ? ({ ...(snap.data() as StaffUser), uid: u.uid }) : null);
          setLoading(false);
        },
        () => {
          setStaff(null);
          setLoading(false);
        }
      );
    });
    return () => {
      unsub();
      unsubDoc?.();
    };
  }, []);

  if (!CONFIGURED)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="card max-w-md space-y-2 p-6 text-sm text-slate-600">
          <p className="font-semibold text-accent-600">Firebase não configurado neste deploy</p>
          <p>
            As variáveis <code>NEXT_PUBLIC_FIREBASE_*</code> não estavam disponíveis quando o site foi gerado. Cadastre-as na
            Vercel (Settings → Environment Variables, ambiente Production) e faça um novo deploy (Deployments → Redeploy).
          </p>
        </div>
      </main>
    );

  return (
    <AuthContext.Provider value={{ user, staff, loading, logout: () => signOut(auth()) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
