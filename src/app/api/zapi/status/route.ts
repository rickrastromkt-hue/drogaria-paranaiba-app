import { handler, requireStaff } from "@/lib/api";
import { zapi } from "@/lib/zapi";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  await requireStaff(req, { admin: true });
  const status = await zapi.status();
  let qr: string | null = null;
  if (!status.connected) {
    const v = (await zapi.qrCodeImage().catch(() => ({ value: undefined }))).value;
    qr = v ? (v.startsWith("data:") ? v : `data:image/png;base64,${v}`) : null;
  }
  return { ...status, qr };
});
