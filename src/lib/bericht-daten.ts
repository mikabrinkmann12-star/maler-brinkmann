import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AnzeigeInfo } from "@/components/bericht-anzeige";
import { firmaLaden } from "@/lib/firma-daten";
import { adresseText, kontaktName } from "@/lib/projekt";
import { vorschauPfad } from "@/lib/bild";
import { formatDatumZeit } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TeamMitglied = { id: string; name: string };
export type FotoWahl = { id: string; vorschauUrl: string | null; bildUrl: string | null; wann: string };

/** Projekt, Rechte, Team und Fotos für die Berichtsseiten. Rechte regelt RLS; ohne Zugriff gibt es 404. */
export async function berichtKontext(projektId: string) {
  const nutzer = await requireUser();
  if (!UUID.test(projektId)) notFound();
  const supabase = await createClient();
  const [{ data: projekt }, { data: mitglieder }, kollegen] = await Promise.all([
    supabase.from("projects").select("id, name, projektnummer, archiviert_am, baustelle_strasse, baustelle_plz, baustelle_ort, contacts(firmenname, vorname, nachname, strasse, plz, ort)").eq("id", projektId).maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", projektId),
    kollegenLaden(),
  ]);
  const istBuero = istBueroRolle(nutzer.rolle);
  const istMitglied = (mitglieder ?? []).some((m) => m.user_id === nutzer.id);
  if (!projekt || (!istBuero && !istMitglied)) notFound();

  const namen = new Map<string, string>();
  for (const k of kollegen.values()) namen.set(k.id, `${k.vorname} ${k.nachname}`.trim());
  const team: TeamMitglied[] = (mitglieder ?? []).map((m) => ({ id: m.user_id, name: namen.get(m.user_id) ?? "Ehemaliger Kollege" }));
  const wer = (uid: string | null) => (uid === nutzer.id ? "Du" : (uid && namen.get(uid)) || "Ehemaliger Kollege");
  return { nutzer, supabase, projekt, istBuero, istMitglied, team, namen, wer, darfSchreiben: !projekt.archiviert_am && (istBuero || istMitglied) };
}

type Kontext = Awaited<ReturnType<typeof berichtKontext>>;

/** Fotos der Baustelle (neueste zuerst) mit zeitlich begrenzten Adressen; `nur` beschränkt auf bestimmte Foto-IDs. */
export async function projektFotos(k: Pick<Kontext, "supabase" | "projekt">, nur?: string[]): Promise<FotoWahl[]> {
  if (nur && nur.length === 0) return [];
  let abfrage = k.supabase.from("project_photos").select("id, storage_pfad, created_at").eq("project_id", k.projekt.id).is("archiviert_am", null);
  if (nur) abfrage = abfrage.in("id", nur);
  const { data } = await abfrage.order("created_at", { ascending: false }).limit(100);
  const fotos = data ?? [];
  const pfade = fotos.flatMap((f) => [f.storage_pfad, vorschauPfad(f.storage_pfad)]);
  const { data: adressen } = pfade.length ? await k.supabase.storage.from("projektfotos").createSignedUrls(pfade, 3600) : { data: [] };
  const url = new Map((adressen ?? []).filter((a) => a.signedUrl && !a.error).map((a) => [a.path, a.signedUrl]));
  return fotos.map((f) => ({
    id: f.id,
    bildUrl: url.get(f.storage_pfad) ?? null,
    vorschauUrl: url.get(vorschauPfad(f.storage_pfad)) ?? url.get(f.storage_pfad) ?? null,
    wann: formatDatumZeit(f.created_at),
  }));
}

/**
 * Angaben für „Allgemeine Informationen“ (Auftragnehmer = Firma aus den Einstellungen, Auftraggeber = Kunde, Leistungsort)
 * und die Personenliste für Auswahlfelder (alle aktiven Kollegen, wie die Datenbank sie liefert).
 */
export async function berichtAngaben(k: Kontext): Promise<{ info: AnzeigeInfo; personen: TeamMitglied[] }> {
  const [firma, kollegen] = await Promise.all([firmaLaden(), kollegenLaden()]);
  const p = k.projekt;
  const kunde = p.contacts;
  const personen = [...kollegen.values()]
    .map((x) => ({ id: x.id, name: `${x.vorname} ${x.nachname}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  return {
    info: {
      auftragnehmer: [firma.name, adresseText({ strasse: firma.strasse, plz: firma.plz, ort: firma.ort })].filter(Boolean).join("\n"),
      auftraggeber: [kontaktName(kunde), kunde ? adresseText({ strasse: kunde.strasse, plz: kunde.plz, ort: kunde.ort }) : ""].filter(Boolean).join("\n"),
      projekt: p.name,
      leistungsort: adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }),
      erstelltVon: "",
    },
    personen,
  };
}
