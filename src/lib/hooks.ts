"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_SETTINGS, type QuickReply, type Settings, type StaffUser } from "./types";

export function useTeam() {
  const [team, setTeam] = useState<StaffUser[]>([]);
  useEffect(
    () =>
      onSnapshot(query(collection(db(), "users"), orderBy("name")), (snap) =>
        setTeam(snap.docs.map((d) => ({ ...(d.data() as StaffUser), uid: d.id })))
      ),
    []
  );
  return team;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(
    () =>
      onSnapshot(doc(db(), "settings", "general"), (snap) => {
        setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) });
        setLoaded(true);
      }),
    []
  );
  return { settings, loaded };
}

export function useQuickReplies() {
  const [items, setItems] = useState<QuickReply[]>([]);
  useEffect(
    () =>
      onSnapshot(query(collection(db(), "quickReplies"), orderBy("shortcut")), (snap) =>
        setItems(snap.docs.map((d) => ({ ...(d.data() as QuickReply), id: d.id })))
      ),
    []
  );
  return items;
}
