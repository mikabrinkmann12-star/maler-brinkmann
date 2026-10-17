import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { berichtPdfErzeugen } from "@/lib/bericht-pdf-daten";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bericht als PDF. Route Handler brauchen eine eigene Anmeldeprüfung (die Layouts greifen hier nicht);
 * wer den Bericht lesen darf (Büro/Admin, Team der Baustelle), regelt die Datenbank (RLS). `?download=1` lädt herunter.
 */
export async function GET(anfrage: Request, { params }: RouteContext<"/baustellen/[id]/berichte/[bid]/pdf">) {
  await requireUser();
  const { id, bid } = await params;
  if (!UUID.test(id) || !UUID.test(bid)) return new NextResponse("Nicht gefunden", { status: 404 });
  const pdf = await berichtPdfErzeugen(id, bid);
  if (!pdf) return new NextResponse("Nicht gefunden", { status: 404 });

  const herunterladen = new URL(anfrage.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${herunterladen ? "attachment" : "inline"}; filename="${pdf.dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
