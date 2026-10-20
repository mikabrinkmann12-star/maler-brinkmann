import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { angebotPdfErzeugen } from "@/lib/angebot-pdf-daten";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Angebot als PDF (nur Büro/Admin). Route Handler brauchen eine eigene Rollenprüfung,
 * die Layouts greifen hier nicht. `?download=1` lädt herunter, sonst wird es im Browser angezeigt.
 */
export async function GET(anfrage: Request, { params }: RouteContext<"/buero/angebote/[id]/pdf">) {
  await requireBueroRecht("angebote");
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const pdf = await angebotPdfErzeugen(id);
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
