import "server-only";
import { BERICHT_ART_NAMEN, datenLesen, istBerichtArt, verweise } from "@/lib/bericht";
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
  if (!b || !istBerichtArt(b.art)) return null;
  const art = b.art;

  const [{ data: p }, firma, vorgaben, kollegen] = await Promise.all([
    supabase
      .from("projects")
      .select("name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort, contacts(firmenname, vorname, nachname, strasse, plz, ort)")
      .eq("id", projektId)
      .maybeSingle(),
    firmaLaden(),
    angebotEinstellungenLaden(),
    kollegenLaden(),
  ]);
  if (!p) return null;

  const daten = datenLesen(art, b.daten);
  const { fotos: fotoIds } = verweise(art, daten);
  const name = (uid: string | null) => {
    const k = uid ? kollegen.get(uid) : undefined;
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };

  // Fotos (nur nicht archivierte Fotos dieses Projekts)
  const fotos = new Map<string, Uint8Array>();
  if (fotoIds.length) {
    const { data: zeilen } = await supabase.from("project_photos").select("id, storage_pfad").eq("project_id", projektId).is("archiviert_am", null).in("id", fotoIds);
    for (const zeile of zeilen ?? []) {
      const { data } = await supabase.storage.from("projektfotos").download(zeile.storage_pfad);
      if (data) fotos.set(zeile.id, new Uint8Array(await data.arrayBuffer()));
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

  const titel = BERICHT_ART_NAMEN[art];
  const bytes = await berichtPdf({
    firma,
    logo,
    art,
    titel,
    entwurf: b.status === "entwurf",
    datum: b.datum,
    projektName: p.name,
    projektnummer: p.projektnummer,
    baustelle: adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }),
    kunde: [kontaktName(p.contacts), p.contacts ? adresseText({ strasse: p.contacts.strasse, plz: p.contacts.plz, ort: p.contacts.ort }) : ""].filter(Boolean).join("\n"),
    daten,
    personName: name,
    fotos,
    erstelltVon: daten.allgemein.erstelltVon ? name(daten.allgemein.erstelltVon) : name(b.erstellt_von),
    abgeschlossenAm: b.abgeschlossen_am ? formatDatumZeit(b.abgeschlossen_am) : "",
    unterschrift,
  });
  return { bytes, dateiname: berichtDateiname(titel, b.datum, p.name) };
}
