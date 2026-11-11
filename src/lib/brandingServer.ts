import "server-only";
import { adminDb } from "./firebase-admin";
import { mergeBranding, type Branding } from "./branding";

export async function getBranding(): Promise<Branding> {
  try {
    const snap = await adminDb().doc("settings/branding").get();
    return mergeBranding(snap.data() as Partial<Branding> | undefined);
  } catch {
    return mergeBranding(null);
  }
}
