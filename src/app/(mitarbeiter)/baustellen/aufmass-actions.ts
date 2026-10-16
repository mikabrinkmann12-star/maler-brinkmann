"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AUFMASS_EINHEITEN, aufmassBerechnen } from "@/lib/aufmass";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

// Aufmaß speichern. Eine Zeile besteht aus dem Aufmaß und seinen Abzügen
// (zwei Tabellen). Damit nie eine halbe Zeile sichtbar ist, wird sie zuerst
// unsichtbar (archiviert) angelegt und erst am Ende freigeschaltet.
// Ändern = neue Fassung anlegen und die alte archivieren (Verlauf bleibt).
// Die Menge rechnet immer der Server (src/lib/aufmass.ts).

export type AufmassErgebnis = { fehler?: string };

const zahl = (max: number) => z.number().min(0).max(max);

const aufmassSchema = z
  .object({
    id: z.uuid(),
    ersetztId: z.uuid().nullable().default(null),
    projektId: z.uuid(),
    raum: z.string().trim().min(1, "Bitte den Raum angeben (z. B. Wohnzimmer).").max(80, "Der Raum ist zu lang."),
    position: z.string().trim().min(1, "Bitte angeben, was gemacht wird (z. B. Wände streichen).").max(120, "Die Position ist zu lang."),
    einheit: z.enum(AUFMASS_EINHEITEN),
    laenge: zahl(1000).nullable(),
    hoehe: zahl(1000).nullable(),
    anzahl: z.number().positive("Die Anzahl muss größer als 0 sein.").max(10_000),
    bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang.").default(""),
    abzuege: z
      .array(
        z.object({
          bezeichnung: z.string().trim().min(1).max(50),
          breite: z.number().positive("Abzug: Breite fehlt.").max(100),
          hoehe: z.number().positive("Abzug: Höhe fehlt.").max(100),
          anzahl: z.number().positive().max(1000),
        }),
      )
      .max(50)
      .default([]),
  })
  .superRefine((d, ctx) => {
    if (d.einheit !== "stk" && !(d.laenge && d.laenge > 0)) ctx.addIssue({ code: "custom", message: "Bitte die Länge angeben." });
    if (d.einheit === "m2" && !(d.hoehe && d.hoehe > 0)) ctx.addIssue({ code: "custom", message: "Bitte die Höhe bzw. Breite angeben." });
  });

function aktualisieren(projektId: string) {
  revalidatePath(`/baustellen/${projektId}`);
  revalidatePath(`/baustellen/${projektId}/aufmass`);
}

export async function aufmassSpeichern(eingabe: unknown): Promise<AufmassErgebnis> {
  const nutzer = await requireUser();
  const pruefung = aufmassSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const d = pruefung.data;
  const istM2 = d.einheit === "m2";
  const abzuege = istM2 ? d.abzuege : [];
  const ergebnis = aufmassBerechnen({ einheit: d.einheit, laenge: d.laenge, hoehe: d.hoehe, anzahl: d.anzahl, abzuege });
  const supabase = await createClient();

  // Ändern: Darf ich die alte Fassung ersetzen?
  if (d.ersetztId) {
    const { data: alt } = await supabase.from("measurements").select("project_id, erstellt_von").eq("id", d.ersetztId).maybeSingle();
    if (!alt || alt.project_id !== d.projektId) return { fehler: "Dieses Aufmaß gibt es nicht (mehr)." };
    if (!istBueroRolle(nutzer.rolle) && alt.erstellt_von !== nutzer.id) return { fehler: "Ändern kannst du nur dein eigenes Aufmaß." };
  }

  const { data: vorhanden } = await supabase.from("measurements").select("archiviert_am").eq("id", d.id).maybeSingle();
  if (vorhanden && !vorhanden.archiviert_am) return {}; // schon fertig gespeichert (zweiter Versuch)

  if (!vorhanden) {
    const { error } = await supabase.from("measurements").insert({
      id: d.id,
      project_id: d.projektId,
      raum: d.raum,
      position: d.position,
      einheit: d.einheit,
      laenge: d.einheit === "stk" ? null : d.laenge,
      hoehe: istM2 ? d.hoehe : null,
      anzahl: d.anzahl,
      menge: ergebnis.menge,
      bemerkung: d.bemerkung || null,
      erstellt_von: nutzer.id,
      archiviert_am: new Date().toISOString(), // unsichtbar, bis alles da ist
    });
    if (error) return { fehler: "Aufmaß geht nur auf Baustellen, auf denen du eingetragen bist." };
  } else {
    // Ein früherer Versuch ist mittendrin abgebrochen: Abzüge neu schreiben
    await supabase.from("measurement_deductions").delete().eq("measurement_id", d.id);
  }

  if (abzuege.length) {
    const { error } = await supabase
      .from("measurement_deductions")
      .insert(abzuege.map((a) => ({ measurement_id: d.id, ...a })));
    if (error) return { fehler: "Die Abzüge konnten nicht gespeichert werden. Bitte nochmal senden." };
  }

  if (d.ersetztId) {
    const { error } = await supabase
      .from("measurements")
      .update({ archiviert_am: new Date().toISOString() })
      .eq("id", d.ersetztId)
      .is("archiviert_am", null);
    if (error) return { fehler: "Die alte Fassung konnte nicht ersetzt werden. Bitte nochmal senden." };
  }

  const { data: frei, error: freiFehler } = await supabase
    .from("measurements")
    .update({ archiviert_am: null })
    .eq("id", d.id)
    .select("id");
  if (freiFehler || !frei?.length) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal senden." };

  aktualisieren(d.projektId);
  return {};
}

/** Löschen = archivieren (eigenes Aufmaß oder Büro/Admin, RLS prüft). */
export async function aufmassArchivieren(aufmassId: string): Promise<AufmassErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(aufmassId).success) return { fehler: "Ungültiger Eintrag." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("measurements")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", aufmassId)
    .is("archiviert_am", null)
    .select("project_id");
  if (error) return { fehler: "Löschen hat nicht geklappt." };
  if (!data.length) {
    const { data: schon } = await supabase.from("measurements").select("archiviert_am").eq("id", aufmassId).maybeSingle();
    return schon?.archiviert_am ? {} : { fehler: "Löschen kannst du nur dein eigenes Aufmaß." };
  }
  aktualisieren(data[0].project_id);
  return {};
}
