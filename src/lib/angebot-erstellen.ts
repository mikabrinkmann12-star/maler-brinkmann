import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { angebotEinstellungenLaden } from "@/lib/firma-daten";
import { briefanschrift } from "@/lib/kontakt-schema";
import { adresseText } from "@/lib/projekt";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import type { Database } from "@/lib/supabase/database.types";
import { standardVorlage } from "@/lib/textvorlagen";
import { textvorlagenLaden } from "@/lib/textvorlagen-daten";

// Neues Angebot (nur ENTWURF) für ein Projekt: Büro-Aktion und API. Der Aufrufer hat die Berechtigung vorher geprüft.

export type AngebotEntwurfErgebnis = { fehler?: string; id?: string };

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message;
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

/**
 * Vorbelegt aus Projekt, Kunde und den Vorgaben der Einstellungen: Leistungsort = Baustellen-Adresse, Empfänger = Briefanschrift des Kunden,
 * Steuer = Steuersatz des Kunden (0 % beim Kunden bedeutet Reverse-Charge), Zahlungsziel vom Kunden, sonst von der Firma, Texte und Rabatt aus „Angebote – Vorgaben“.
 */
export async function angebotEntwurfAnlegen(
  db: SupabaseClient<Database>,
  projektId: string,
  eingabe: { betreff: string; leistungsort?: string },
  nutzerId?: string,
): Promise<AngebotEntwurfErgebnis> {
  const { data: projekt } = await db
    .from("projects")
    .select(
      "id, archiviert_am, baustelle_strasse, baustelle_plz, baustelle_ort, contacts(typ, anrede, firmenname, ansprechpartner, vorname, nachname, strasse, plz, ort, empfaenger, steuersatz, zahlungsziel_tage, skonto_prozent, skonto_tage)",
    )
    .eq("id", projektId)
    .maybeSingle();
  if (!projekt) return { fehler: "Projekt nicht gefunden." };
  if (projekt.archiviert_am) return { fehler: "Für ein archiviertes Projekt kann kein Angebot angelegt werden." };

  const vorgaben = await angebotEinstellungenLaden(db);
  // Eine Standard-Vorlage (Einstellungen → Textvorlagen) füllt die Texte vor, sonst gilt der Text aus „Angebote – Vorgaben“
  const vorlagen = await textvorlagenLaden(db);
  const kunde = projekt.contacts;
  const kundenSatz = kunde ? Number(kunde.steuersatz) : vorgaben.standard_steuersatz;
  const reverseCharge = kunde != null && kundenSatz === 0;
  const steuersatz = reverseCharge ? 0 : kundenSatz;

  const leistungsort = eingabe.leistungsort?.trim()
    || adresseText({ strasse: projekt.baustelle_strasse, plz: projekt.baustelle_plz, ort: projekt.baustelle_ort });

  const firmenZiel = await rechnungsEinstellungenLaden(db);
  const { data, error } = await db
    .from("quotes")
    .insert({
      project_id: projektId,
      betreff: eingabe.betreff,
      leistungsort: leistungsort || null,
      datum: heuteIso(),
      zahlungsziel_tage: kunde?.zahlungsziel_tage ?? firmenZiel.zahlungszielTage,
      skonto_prozent: kunde?.zahlungsziel_tage != null ? (kunde.skonto_prozent && kunde.skonto_tage ? kunde.skonto_prozent : null) : firmenZiel.skontoProzent,
      skonto_tage: kunde?.zahlungsziel_tage != null ? (kunde.skonto_prozent && kunde.skonto_tage ? kunde.skonto_tage : null) : firmenZiel.skontoTage,
      gueltig_bis: vorgaben.gueltigkeit_tage > 0 ? tageVerschieben(heuteIso(), vorgaben.gueltigkeit_tage) : null,
      empfaenger: kunde ? briefanschrift(kunde).join("\n") || null : null,
      einleitung: (standardVorlage(vorlagen, "einleitung")?.inhalt ?? vorgaben.einleitung) || null,
      schlusstext: (standardVorlage(vorlagen, "schlusstext")?.inhalt ?? vorgaben.schlusstext) || null,
      steuersatz,
      reverse_charge: reverseCharge,
      rabatt_prozent: vorgaben.standard_rabatt,
      ...(nutzerId ? { created_by: nutzerId } : {}),
    })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  return { id: data.id };
}
