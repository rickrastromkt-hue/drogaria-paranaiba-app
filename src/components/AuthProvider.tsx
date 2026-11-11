"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { setActingHeader } from "@/lib/client";
import { disablePush } from "@/lib/pushClient";
import { canDelegate, type StaffUser } from "@/lib/types";

type Ctx = {
  user: User | null;
  /** Conta logada (permissões). */
  staff: StaffUser | null;
  /** Quem está atendendo agora (computador compartilhado). null = a própria conta. */
  acting: StaffUser | null;
  /** Identidade efetiva: acting ?? staff. Use para "meus atendimentos", nomes e saudações. */
  me: StaffUser | null;
  setActing: (uid: string | null) => void;
  loading: boolean;
  logout: () => Promise<void>;
};

const ACTING_KEY = "acting-as-uid";

// Variáveis NEXT_PUBLIC_* são gravadas no build: se faltarem, é preciso fazer um novo deploy.
const CONFIGURED = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export const AuthContext = createContext<Ctx>({
  user: null,
  staff: null,
  acting: null,
  me: null,
  setActing: () => {},
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingUid, setActingUid] = useState<string | null>(null);
  const [acting, setActingUser] = useState<StaffUser | null>(null);

  useEffect(() => {
    // A escolha agora é feita a cada atendimento ("Quem vai atender?"); limpa o modo antigo.
    try {
      localStorage.removeItem(ACTING_KEY);
    } catch {}
  }, []);

  // Só administradores e supervisores podem atender em nome de outra pessoa.
  const effectiveUid = canDelegate(staff?.role) && actingUid && actingUid !== staff?.uid ? actingUid : null;

  useEffect(() => {
    setActingHeader(effectiveUid);
    if (!effectiveUid) {
      setActingUser(null);
      return;
    }
    return onSnapshot(doc(db(), "users", effectiveUid), (snap) => {
      const d = snap.exists() ? ({ ...(snap.data() as StaffUser), uid: snap.id }) : null;
      if (!d || !d.active) {
        setActingUid(null);
        try {
          localStorage.removeItem(ACTING_KEY);
        } catch {}
      }
      setActingUser(d && d.active ? d : null);
    });
  }, [effectiveUid]);

  function setActing(uid: string | null) {
    setActingUid(uid);
    try {
      if (uid) localStorage.setItem(ACTING_KEY, uid);
      else localStorage.removeItem(ACTING_KEY);
    } catch {}
  }

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
    <AuthContext.Provider
      value={{
        user,
        staff,
        acting,
        me: acting ?? staff,
        setActing,
        loading,
        logout: async () => {
          setActing(null);
          await disablePush(); // este aparelho para de receber notificações desta conta
          await signOut(auth());
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
