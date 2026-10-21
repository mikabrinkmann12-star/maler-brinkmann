"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zahlLesen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { darf, requireBueroRecht } from "@/lib/auth";
import { preisAnpassen, zielAusZuschlag } from "@/lib/preis-anpassen";
import { kontaktName } from "@/lib/projekt";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

// Hilfen für den Angebots-Editor (Büro und Admin): Positionen aus anderen Dokumenten übernehmen und „Preis anpassen“.
// Verbindlich regeln RLS und Trigger der Datenbank die Rechte und die Sperre nach dem Versand.

export type EditorErgebnis = { fehler?: string; hinweis?: string };

const uuid = z.uuid();

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren(angebotId: string) {
  revalidatePath("/buero/angebote", "layout");
  revalidatePath(`/buero/angebote/${angebotId}`);
}

// ---------------------------------------------------------------------------
// Positionen aus anderen Dokumenten übernehmen (Seitenleiste „Suche“ bzw. „Aus bestehendem Dokument“ in Plancraft)
// ---------------------------------------------------------------------------

export type DokumentTreffer = { art: "angebot" | "rechnung"; id: string; titel: string; nummer: string; projekt: string; kunde: string; datum: string };
export type DokumentPosition = { id: string; typ: string; kurztext: string; langtext: string; menge: number | null; einheit: string; einzelpreis: number | null };

const MAX_TREFFER = 30;

/** Angebote und Rechnungen durchsuchen (Betreff, Nummer, Projekt, Kunde); mehrere Wörter müssen alle vorkommen. Leer = die neuesten. */
export async function dokumentSuchen(angebotId: string, q: string): Promise<{ fehler?: string; treffer?: DokumentTreffer[] }> {
  await requireBueroRecht("angebote");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const supabase = await createClient();

  const [angebote, rechnungen] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, betreff, datum, projects(name, projektnummer, contacts(firmenname, vorname, nachname))")
      .neq("id", angebotId)
      .order("datum", { ascending: false })
      .limit(400),
    (await darf("rechnungen"))
      ? supabase
          .from("invoices")
          .select("id, betreff, rechnungsdatum, rechnungsnummer, projects(name, projektnummer, contacts(firmenname, vorname, nachname))")
          .order("rechnungsdatum", { ascending: false })
          .limit(400)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (angebote.error || rechnungen.error) return { fehler: "Die Dokumente konnten nicht geladen werden." };

  const alle: DokumentTreffer[] = [
    ...(angebote.data ?? []).map((a): DokumentTreffer => ({ art: "angebot", id: a.id, titel: a.betreff, nummer: "", projekt: [a.projects?.projektnummer, a.projects?.name].filter(Boolean).join(" · "), kunde: a.projects?.contacts ? kontaktName(a.projects.contacts) : "", datum: a.datum })),
    ...(rechnungen.data ?? []).map((r): DokumentTreffer => ({ art: "rechnung", id: r.id, titel: r.betreff, nummer: r.rechnungsnummer ?? "", projekt: [r.projects?.projektnummer, r.projects?.name].filter(Boolean).join(" · "), kunde: r.projects?.contacts ? kontaktName(r.projects.contacts) : "", datum: r.rechnungsdatum ?? "" })),
  ].sort((a, b) => b.datum.localeCompare(a.datum));

  const woerter = suchtext(q).toLowerCase().split(/\s+/).filter(Boolean);
  const treffer = woerter.length
    ? alle.filter((d) => {
        const heu = [d.titel, d.nummer, d.projekt, d.kunde].join(" ").toLowerCase();
        return woerter.every((w) => heu.includes(w));
      })
    : alle;
  return { treffer: treffer.slice(0, MAX_TREFFER) };
}

/** Positionen, Titel und Texte eines Dokuments zum Auswählen. */
export async function dokumentPositionen(art: string, id: string): Promise<{ fehler?: string; positionen?: DokumentPosition[] }> {
  await requireBueroRecht("angebote");
  if ((art !== "angebot" && art !== "rechnung") || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  if (art === "rechnung" && !(await darf("rechnungen"))) return { fehler: "Dafür fehlt das Recht auf Rechnungen." };
  const supabase = await createClient();
  // Rechnungen kennen nur Positionen und Texte, Angebote auch Titel
  const { data, error } =
    art === "angebot"
      ? await supabase.from("quote_items").select("id, typ, kurztext, langtext, menge, einheit, einzelpreis").eq("quote_id", id).in("typ", ["position", "titel", "text"]).order("sortierung").order("created_at").limit(1000)
      : await supabase.from("invoice_items").select("id, typ, kurztext, langtext, menge, einheit, einzelpreis").eq("invoice_id", id).in("typ", ["position", "text"]).order("sortierung").order("created_at").limit(1000);
  if (error) return { fehler: "Die Positionen konnten nicht geladen werden." };
  return {
    positionen: data.map((p) => ({ id: p.id, typ: p.typ, kurztext: p.kurztext ?? "", langtext: p.langtext ?? "", menge: p.menge == null ? null : Number(p.menge), einheit: p.einheit ?? "", einzelpreis: p.einzelpreis == null ? null : Number(p.einzelpreis) })),
  };
}

const uebernehmenSchema = z.object({
  art: z.enum(["angebot", "rechnung"]),
  quelleId: z.uuid(),
  ids: z.array(z.uuid()).min(1, "Bitte mindestens eine Position auswählen.").max(500),
  mengen: z.boolean(),
  nachId: z.uuid().nullable(),
});

/** Gewählte Bausteine aus einem anderen Dokument ans Ende (oder hinter `nachId`) des Angebots kopieren. Ohne „Mengen übernehmen“ ist die Menge 1. */
export async function positionenUebernehmen(angebotId: string, eingabe: unknown): Promise<EditorErgebnis> {
  await requireBueroRecht("angebote");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const p = uebernehmenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  if (p.data.art === "rechnung" && !(await darf("rechnungen"))) return { fehler: "Dafür fehlt das Recht auf Rechnungen." };

  const supabase = await createClient();
  const spalten = "id, typ, kurztext, langtext, menge, einheit, einzelpreis, sortierung";
  const { data: quelle, error } =
    p.data.art === "angebot"
      ? await supabase.from("quote_items").select(`${spalten}, material_id, service_id`).eq("quote_id", p.data.quelleId).in("id", p.data.ids)
      : await supabase.from("invoice_items").select(spalten).eq("invoice_id", p.data.quelleId).in("id", p.data.ids);
  if (error) return { fehler: "Die Positionen konnten nicht gelesen werden." };
  const gewaehlt = (quelle as unknown as (DokumentPosition & { sortierung: number; material_id?: string | null; service_id?: string | null })[])
    .filter((z) => ["position", "titel", "text"].includes(z.typ))
    .sort((a, b) => a.sortierung - b.sortierung);
  if (!gewaehlt.length) return { fehler: "Es wurde nichts gefunden, das sich übernehmen lässt." };

  const { data: letzte } = await supabase.from("quote_items").select("sortierung").eq("quote_id", angebotId).order("sortierung", { ascending: false }).limit(1);
  const start = (letzte?.[0]?.sortierung ?? -1) + 1;
  const { data: neu, error: einfuegen } = await supabase
    .from("quote_items")
    .insert(
      gewaehlt.map((z, i) => ({
        quote_id: angebotId,
        sortierung: start + i,
        typ: z.typ as "position" | "titel" | "text",
        kurztext: z.kurztext,
        langtext: z.langtext || null,
        menge: z.typ === "position" ? (p.data.mengen ? z.menge ?? 1 : 1) : null,
        einheit: z.typ === "position" ? z.einheit : null,
        einzelpreis: z.typ === "position" ? z.einzelpreis ?? 0 : null,
        material_id: z.material_id ?? null,
        service_id: z.service_id ?? null,
      })),
    )
    .select("id, sortierung");
  if (einfuegen) return { fehler: dbMeldung(einfuegen) };

  // Soll es mitten ins Angebot: alle Bausteine neu durchzählen (die neuen direkt hinter `nachId`)
  if (p.data.nachId) {
    const { data: alle } = await supabase.from("quote_items").select("id").eq("quote_id", angebotId).order("sortierung").order("created_at");
    const neueIds = new Set((neu ?? []).sort((a, b) => a.sortierung - b.sortierung).map((n) => n.id));
    const reihenfolge = (alle ?? []).map((a) => a.id).filter((x) => !neueIds.has(x));
    const stelle = reihenfolge.indexOf(p.data.nachId);
    if (stelle >= 0) {
      reihenfolge.splice(stelle + 1, 0, ...[...neueIds]);
      for (const [i, id] of reihenfolge.entries()) await supabase.from("quote_items").update({ sortierung: i }).eq("id", id);
    }
  }
  aktualisieren(angebotId);
  return { hinweis: `${gewaehlt.length} ${gewaehlt.length === 1 ? "Baustein" : "Bausteine"} übernommen.` };
}

// ---------------------------------------------------------------------------
// Preis anpassen
// ---------------------------------------------------------------------------

const anpassenSchema = z.object({ modus: z.enum(["netto", "zuschlag"]), wert: z.string().min(1, "Bitte einen Wert eingeben.") });

/**
 * „Preis anpassen“: Nettosumme (vor Rabatt) auf einen Zielwert bringen, entweder direkt oder über einen Zuschlag/Abschlag in Prozent.
 * Alle bepreisten Positionen werden mit demselben Faktor umgerechnet (auf Cent), ein Rest wandert auf die größte Position.
 */
export async function preisAnpassenSpeichern(angebotId: string, eingabe: unknown): Promise<EditorErgebnis> {
  await requireBueroRecht("angebote");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const p = anpassenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  const zahl = zahlLesen(p.data.wert, 2);
  if (zahl === null) return { fehler: p.data.modus === "netto" ? "Bitte einen Betrag in Euro angeben, z. B. 12.500,00." : "Bitte einen Prozentwert angeben, z. B. 5 oder -3,5." };

  const detail = await angebotLaden(angebotId);
  if (!detail) return { fehler: "Angebot nicht gefunden." };
  if (detail.angebot.status !== "entwurf" || detail.angebot.archiviert) return { fehler: "Dieses Angebot ist gesperrt. Setze es zuerst zurück auf Entwurf." };

  const positionen = detail.bausteine.filter((b) => b.typ === "position").map((b) => ({ id: b.id, menge: b.menge ?? 0, einzelpreis: b.einzelpreis ?? 0 }));
  const jetzt = positionen.reduce((s, x) => s + Math.round(x.menge * 1000 * Math.round(x.einzelpreis * 100) / 1000), 0) / 100;
  const ziel = p.data.modus === "netto" ? zahl : zielAusZuschlag(jetzt, zahl);
  if (ziel > 9_999_999) return { fehler: "Die Summe ist zu groß." };

  const r = preisAnpassen(positionen, ziel);
  if (!r) return { fehler: "Es gibt keine bepreisten Positionen oder das Ziel ist ungültig." };
  if (!r.neuePreise.length) return { hinweis: "Die Nettosumme stimmt schon." };

  const supabase = await createClient();
  for (const n of r.neuePreise) {
    const { error } = await supabase.from("quote_items").update({ einzelpreis: n.einzelpreis }).eq("id", n.id).eq("quote_id", angebotId);
    if (error) return { fehler: dbMeldung(error) };
  }
  aktualisieren(angebotId);
  return { hinweis: r.rest === 0 ? "Preise angepasst." : `Preise angepasst, die Summe weicht wegen der Rundung um ${Math.abs(r.rest).toFixed(2).replace(".", ",")} € ab.` };
}
