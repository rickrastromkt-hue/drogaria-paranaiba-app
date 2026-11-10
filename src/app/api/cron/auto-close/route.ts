import { NextResponse } from "next/server";
import { HttpError, requireStaff } from "@/lib/api";
import { sweepInactive } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/**
 * Encerra atendimentos com cliente ausente.
 * Pode ser chamado por:
 *  - Vercel Cron / cron-job.org: header "Authorization: Bearer CRON_SECRET" ou ?secret=CRON_SECRET
 *  - O próprio painel (qualquer atendente logado) a cada minuto
 */
async function run(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("secret");
  const byCron = !!cronSecret && (auth === `Bearer ${cronSecret}` || qs === cronSecret);
  try {
    if (!byCron) await requireStaff(req);
    const closed = await sweepInactive();
    return NextResponse.json({ ok: true, closed });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
