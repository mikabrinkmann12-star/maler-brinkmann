import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { angebotPdf } from "@/lib/angebot-pdf";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dateiname ohne Sonderzeichen: „Angebot_Technologiepark_Haus_2.pdf“ */
function dateiname(betreff: string): string {
  const sauber = betreff
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `Angebot_${sauber || "ohne_Betreff"}.pdf`;
}

/**
 * Angebot als PDF (nur Büro/Admin). Route Handler brauchen eine eigene Rollenprüfung,
 * die Layouts greifen hier nicht. `?download=1` lädt herunter, sonst wird es im Browser angezeigt.
 */
export async function GET(anfrage: Request, { params }: RouteContext<"/buero/angebote/[id]/pdf">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse("Nicht gefunden", { status: 404 });
  const detail = await angebotLaden(id);
  if (!detail) return new NextResponse("Nicht gefunden", { status: 404 });
  const { angebot: a, bausteine, projekt, kunde } = detail;

  const [firma, vorgaben] = await Promise.all([firmaLaden(), angebotEinstellungenLaden()]);

  // Bilder aus dem privaten Speicher holen
  const supabase = await createClient();
  const bilder: Record<string, Uint8Array> = {};
  for (const b of bausteine) {
    if (b.typ !== "bild" || !b.bildPfad) continue;
    const { data } = await supabase.storage.from("angebotsbilder").download(b.bildPfad);
    if (data) bilder[b.id] = new Uint8Array(await data.arrayBuffer());
  }

  const bytes = await angebotPdf({
    firma,
    status: a.status,
    datum: a.datum,
    betreff: a.betreff,
    leistungsort: a.leistungsort,
    empfaenger: a.empfaenger,
    einleitung: a.einleitung,
    schlusstext: a.schlusstext,
    kundennummer: kunde?.kundennummer ?? "",
    projektnummer: projekt.projektnummer,
    berechnung: angebotBerechnen(bausteine, { rabattProzent: a.rabattProzent, steuersatz: a.steuersatz, reverseCharge: a.reverseCharge }),
    reverseChargeText: vorgaben.reverse_charge_text,
    bilder,
  });

  const herunterladen = new URL(anfrage.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${herunterladen ? "attachment" : "inline"}; filename="${dateiname(a.betreff)}"`,
      "Cache-Control": "no-store",
    },
  });
}
