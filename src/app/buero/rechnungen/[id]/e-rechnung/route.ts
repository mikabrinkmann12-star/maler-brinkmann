import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { eRechnungFuer, gespeichertesPdf, pdfMitXml } from "@/lib/e-rechnung-daten";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * E-Rechnung einer fertigen Rechnung der App (nur Büro/Admin): `?format=xml` (Standard, die strukturierte Rechnung, bei Behörden die XRechnung)
 * oder `?format=pdf` (das Rechnungs-PDF mit eingebettetem XML, ZUGFeRD/Factur-X). Route Handler brauchen eine eigene Rollenprüfung.
 */
export async function GET(anfrage: Request, { params }: RouteContext<"/buero/rechnungen/[id]/e-rechnung">) {
  await requireBueroRecht("rechnungen");
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });

  const e = await eRechnungFuer(id);
  if (!e) return new NextResponse("Eine E-Rechnung gibt es nur zu einer fertigen Rechnung der App.", { status: 404 });

  const format = new URL(anfrage.url).searchParams.get("format") === "pdf" ? "pdf" : "xml";
  if (format === "xml") {
    return new NextResponse(e.xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${e.dateiname}.xml"`, "Cache-Control": "no-store" },
    });
  }
  const supabase = await createClient();
  const { data: r } = await supabase.from("invoices").select("pdf_pfad").eq("id", id).maybeSingle();
  const pdf = await gespeichertesPdf(r?.pdf_pfad ?? null);
  if (!pdf) return new NextResponse("Die Rechnung hat noch kein PDF.", { status: 404 });
  const hybrid = await pdfMitXml(pdf, e.xml);
  return new NextResponse(Buffer.from(hybrid), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${e.dateiname}_ZUGFeRD.pdf"`, "Cache-Control": "no-store" },
  });
}
