import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { rechnungPdfErzeugen } from "@/lib/rechnung-pdf-daten";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PDF-Vorschau eines Rechnungsentwurfs (nur Büro/Admin mit Recht „Ausgangsrechnungen“): „Entwurf“ statt Nummer, Wasserzeichen,
 * wird nie gespeichert. Für fertige Rechnungen gibt es das gespeicherte PDF unter …/pdf.
 */
export async function GET(_anfrage: Request, { params }: RouteContext<"/buero/rechnungen/[id]/vorschau">) {
  await requireBueroRecht("rechnungen");
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const pdf = await rechnungPdfErzeugen(id, { vorschau: true });
  if (!pdf) return new NextResponse("Für diese Rechnung gibt es keine Vorschau (nicht gefunden oder schon fertiggestellt).", { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.dateiname}"`,
      "Cache-Control": "no-store",
    },
  });
}
