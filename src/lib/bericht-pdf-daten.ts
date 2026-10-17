import "server-only";
import { BERICHT_ART_NAMEN, datenLesen, wetterText, type BerichtArt } from "@/lib/bericht";
import { berichtPdf } from "@/lib/bericht-pdf";
import { formatDatumZeit } from "@/lib/format";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { adresseText, kontaktName } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

/** Dateiname ohne Sonderzeichen: „Bautagesbericht_2026-10-17_Technologiepark.pdf“ */
export function berichtDateiname(art: string, datum: string, projekt: string): string {
  const sauber = projekt
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${art}_${datum}_${sauber || "Baustelle"}.pdf`;
}

/**
 * Bericht als PDF erzeugen. Alles wird mit den Rechten des eingeloggten Nutzers gelesen (RLS):
 * Wer den Bericht nicht sehen darf, bekommt null (= 404). Der Aufrufer hat vorher requireUser() geprüft.
 */
export async function berichtPdfErzeugen(projektId: string, berichtId: string): Promise<{ bytes: Uint8Array; dateiname: string } | null> {
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("project_reports")
    .select("id, art, datum, status, daten, erstellt_von, unterschrift_name, unterschrift_pfad, unterschrieben_am, abgeschlossen_am")
    .eq("id", berichtId)
    .eq("project_id", projektId)
    .is("archiviert_am", null)
    .maybeSingle();
  if (!b) return null;

  const [{ data: p }, firma, vorgaben, kollegen] = await Promise.all([
    supabase
      .from("projects")
      .select("name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort, contacts(firmenname, vorname, nachname)")
      .eq("id", projektId)
      .maybeSingle(),
    firmaLaden(),
    angebotEinstellungenLaden(),
    kollegenLaden(),
  ]);
  if (!p) return null;

  const daten = datenLesen(b.daten);
  const name = (uid: string | null) => {
    const k = uid ? kollegen.get(uid) : undefined;
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };

  // Fotos in der gewählten Reihenfolge (nur nicht archivierte Fotos dieses Projekts)
  const fotos: Uint8Array[] = [];
  if (daten.fotos.length) {
    const { data: zeilen } = await supabase.from("project_photos").select("id, storage_pfad").eq("project_id", projektId).is("archiviert_am", null).in("id", daten.fotos);
    const pfad = new Map((zeilen ?? []).map((z) => [z.id, z.storage_pfad]));
    for (const fotoId of daten.fotos) {
      const ziel = pfad.get(fotoId);
      if (!ziel) continue;
      const { data } = await supabase.storage.from("projektfotos").download(ziel);
      if (data) fotos.push(new Uint8Array(await data.arrayBuffer()));
    }
  }

  let unterschrift: { name: string; wann: string; bild: Uint8Array } | undefined;
  if (b.unterschrift_pfad && b.unterschrift_name) {
    const { data } = await supabase.storage.from("berichtunterschriften").download(b.unterschrift_pfad);
    if (data) unterschrift = { name: b.unterschrift_name, wann: formatDatumZeit(b.unterschrieben_am), bild: new Uint8Array(await data.arrayBuffer()) };
  }

  let logo: Uint8Array | undefined;
  if (firma.logo && vorgaben.logo_anzeigen) {
    const { data } = await supabase.storage.from("firmenlogo").download(firma.logo);
    if (data) logo = new Uint8Array(await data.arrayBuffer());
  }

  const titel = BERICHT_ART_NAMEN[b.art as BerichtArt] ?? "Bericht";
  const bytes = await berichtPdf({
    firma,
    logo,
    titel,
    entwurf: b.status === "entwurf",
    datum: b.datum,
    projektName: p.name,
    projektnummer: p.projektnummer,
    baustelle: adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }),
    kunde: kontaktName(p.contacts),
    wetter: wetterText(daten.wetter, daten.temperatur),
    anwesend: daten.personal.map((uid) => name(uid)),
    arbeiten: daten.arbeiten,
    besonderheiten: daten.besonderheiten,
    fotos,
    erstelltVon: name(b.erstellt_von),
    abgeschlossenAm: b.abgeschlossen_am ? formatDatumZeit(b.abgeschlossen_am) : "",
    unterschrift,
  });
  return { bytes, dateiname: berichtDateiname(titel, b.datum, p.name) };
}
