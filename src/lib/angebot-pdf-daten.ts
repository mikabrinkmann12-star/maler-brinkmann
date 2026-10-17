import "server-only";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { angebotPdf } from "@/lib/angebot-pdf";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { createClient } from "@/lib/supabase/server";

/** Dateiname ohne Sonderzeichen: „Angebot_Technologiepark_Haus_2.pdf“ */
export function pdfDateiname(betreff: string): string {
  const sauber = betreff
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `Angebot_${sauber || "ohne_Betreff"}.pdf`;
}

/**
 * Angebot als PDF erzeugen (Firmendaten, Logo und Bilder aus den Einstellungen bzw. dem Speicher).
 * Wer das aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft. null = Angebot gibt es nicht.
 */
export async function angebotPdfErzeugen(id: string): Promise<{ bytes: Uint8Array; dateiname: string } | null> {
  const detail = await angebotLaden(id);
  if (!detail) return null;
  const { angebot: a, bausteine, projekt, kunde } = detail;

  const [firma, vorgaben] = await Promise.all([firmaLaden(), angebotEinstellungenLaden()]);
  const supabase = await createClient();

  const bilder: Record<string, Uint8Array> = {};
  for (const b of bausteine) {
    if (b.typ !== "bild" || !b.bildPfad) continue;
    const { data } = await supabase.storage.from("angebotsbilder").download(b.bildPfad);
    if (data) bilder[b.id] = new Uint8Array(await data.arrayBuffer());
  }

  let logo: Uint8Array | undefined;
  if (firma.logo && vorgaben.logo_anzeigen) {
    const { data } = await supabase.storage.from("firmenlogo").download(firma.logo);
    if (data) logo = new Uint8Array(await data.arrayBuffer());
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
    logo,
  });
  return { bytes, dateiname: pdfDateiname(a.betreff) };
}
