import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Originaldatei der Rechnung (nur Büro/Admin): die Kopie, die Lexware erzeugt hat (PDF/ZUGFeRD oder bei XRechnung XML). Die App erzeugt nie selbst ein Rechnungs-PDF.
 * Route Handler brauchen eine eigene Rollenprüfung, die Layouts greifen hier nicht.
 */
export async function GET(anfrage: Request, { params }: RouteContext<"/buero/rechnungen/[id]/pdf">) {
  await requireBueroRecht("rechnungen");
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });

  const supabase = await createClient();
  const { data: r } = await supabase.from("invoices").select("pdf_pfad, rechnungsnummer").eq("id", id).maybeSingle();
  if (!r?.pdf_pfad) return new NextResponse("Für diese Rechnung gibt es noch kein PDF.", { status: 404 });
  const { data, error } = await supabase.storage.from("rechnungen").download(r.pdf_pfad);
  if (error || !data) return new NextResponse("Das PDF konnte nicht geladen werden.", { status: 404 });

  const istXml = r.pdf_pfad.endsWith(".xml");
  const name = `Rechnung_${(r.rechnungsnummer ?? "").replace(/[^A-Za-z0-9_-]+/g, "_") || id.slice(0, 8)}.${istXml ? "xml" : "pdf"}`;
  const herunterladen = new URL(anfrage.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "Content-Type": istXml ? "application/xml" : "application/pdf",
      "Content-Disposition": `${herunterladen ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
