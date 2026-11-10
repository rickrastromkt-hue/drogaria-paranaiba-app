"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { StaffUser } from "@/lib/types";

type Ctx = { user: User | null; staff: StaffUser | null; loading: boolean; logout: () => Promise<void> };

const AuthContext = createContext<Ctx>({ user: null, staff: null, loading: true, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  return (
    <AuthContext.Provider value={{ user, staff, loading, logout: () => signOut(auth()) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
