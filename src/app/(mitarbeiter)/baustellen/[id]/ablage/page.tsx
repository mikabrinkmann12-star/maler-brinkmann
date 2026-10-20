import type { Metadata } from "next";
import { vorschauPfad } from "@/lib/bild";
import { groesseText } from "@/lib/dateien";
import { formatDatumZeit } from "@/lib/format";
import { projektKontext } from "@/lib/projekt-kontext";
import { Warteschlange } from "../../../warteschlange";
import { Dateien, type DateiAnzeige } from "../dateien";
import { Fotos, type FotoAnzeige } from "../fotos";
import { Notizen, type NotizAnzeige } from "../notizen";

export const metadata: Metadata = { title: "Ablage" };

// Reiter „Ablage“: Fotos, Dateien und Notizen des Projekts.
export default async function AblageSeite({ params }: PageProps<"/baustellen/[id]/ablage">) {
  const { id } = await params;
  const k = await projektKontext(id);
  const { supabase } = k;

  const [{ data: notizDaten }, { data: fotoDaten }, { data: dateiDaten }] = await Promise.all([
    supabase.from("project_notes").select("id, text, erstellt_von, created_at")
      .eq("project_id", id).is("archiviert_am", null).order("created_at", { ascending: false }),
    supabase.from("project_photos").select("id, storage_pfad, kategorie, kommentar, erstellt_von, created_at")
      .eq("project_id", id).is("archiviert_am", null).order("created_at", { ascending: false }),
    supabase.from("project_files").select("id, storage_pfad, dateiname, groesse_bytes, erstellt_von, created_at")
      .eq("project_id", id).is("archiviert_am", null).order("created_at", { ascending: false }),
  ]);

  // Fotos liegen im privaten Speicher: zeitlich begrenzte Adressen (1 Stunde) erzeugen
  const pfade = (fotoDaten ?? []).flatMap((f) => [f.storage_pfad, vorschauPfad(f.storage_pfad)]);
  const { data: adressen } = pfade.length
    ? await supabase.storage.from("projektfotos").createSignedUrls(pfade, 60 * 60)
    : { data: [] };
  const adresse = new Map((adressen ?? []).filter((a) => a.signedUrl && !a.error).map((a) => [a.path, a.signedUrl]));
  const fotos: FotoAnzeige[] = (fotoDaten ?? []).map((f) => ({
    id: f.id,
    kategorie: f.kategorie,
    kommentar: f.kommentar ?? "",
    bildUrl: adresse.get(f.storage_pfad) ?? null,
    vorschauUrl: adresse.get(vorschauPfad(f.storage_pfad)) ?? adresse.get(f.storage_pfad) ?? null,
    wer: k.wer(f.erstellt_von),
    wann: formatDatumZeit(f.created_at),
    darfLoeschen: k.darfLoeschen(f.erstellt_von),
  }));
  // Dateien: Adressen mit dem Originalnamen zum Herunterladen (1 Stunde gültig)
  const dateien: DateiAnzeige[] = await Promise.all(
    (dateiDaten ?? []).map(async (f) => {
      const { data: url } = await supabase.storage.from("projektdateien").createSignedUrl(f.storage_pfad, 60 * 60, { download: f.dateiname });
      return {
        id: f.id,
        dateiname: f.dateiname,
        groesse: groesseText(Number(f.groesse_bytes ?? 0)),
        wer: k.wer(f.erstellt_von),
        wann: formatDatumZeit(f.created_at),
        url: url?.signedUrl ?? null,
        darfLoeschen: k.darfLoeschen(f.erstellt_von),
      };
    }),
  );
  const notizen: NotizAnzeige[] = (notizDaten ?? []).map((n) => ({
    id: n.id,
    text: n.text,
    wer: k.wer(n.erstellt_von),
    wann: formatDatumZeit(n.created_at),
    darfLoeschen: k.darfLoeschen(n.erstellt_von),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Warteschlange userId={k.nutzer.id} />
      <Fotos projektId={id} ichId={k.nutzer.id} darfHochladen={k.darfInhalte} fotos={fotos} />
      <Dateien projektId={id} darfHochladen={k.darfInhalte} dateien={dateien} />
      <Notizen projektId={id} ichId={k.nutzer.id} darfSchreiben={k.darfInhalte} notizen={notizen} />
    </div>
  );
}
