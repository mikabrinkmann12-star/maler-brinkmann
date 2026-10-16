import "server-only";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import {
  kontoBerechnen,
  sollAufloesen,
  standardSoll,
  type KontoEintrag,
  type KontoErgebnis,
  type SollEinstellung,
} from "@/lib/ueberstunden";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";

// Überstundenkonten laden und berechnen. Die Rechte regelt die Datenbank (RLS):
// Mitarbeiter bekommen nur das eigene Profil und die eigenen Zeiten, Büro/Admin alle.
// Wer das Büro-Verzeichnis nutzt, ruft vorher requireRole auf; für Mitarbeiter ist
// `userIds` immer ausdrücklich die eigene ID (wie in mitarbeiter-daten.ts).

export type Konto = KontoErgebnis & { kontoAb: string };

const SEITE = 1000;
const zahlOderNull = (w: number | string | null) => (w == null ? null : Number(w));

/**
 * Konten der angegebenen Personen (nur aktive Personen mit „Konto ab“) für einen Monat.
 * Ohne `userIds`: alle aktiven Personen mit Konto (nur Büro/Admin sehen dann alle).
 */
export async function kontenLaden(opts: { monat: string; userIds?: string[] }): Promise<Map<string, Konto>> {
  const supabase = await createClient();
  const heute = heuteIso();
  const gestern = tageVerschieben(heute, -1);

  let abfrage = supabase
    .from("profiles")
    .select("id, soll_mo, soll_di, soll_mi, soll_do, soll_fr, konto_ab, konto_anfangssaldo")
    .eq("aktiv", true)
    .not("konto_ab", "is", null);
  if (opts.userIds) abfrage = abfrage.in("id", opts.userIds);
  const [{ data: profile, error }, einstellungen] = await Promise.all([abfrage, zeiterfassungEinstellungen()]);
  if (error) throw new Error("Die Überstundenkonten konnten nicht geladen werden.");
  if (!profile.length) return new Map();

  const ids = profile.map((p) => p.id);
  const fruehester = profile.reduce((min, p) => (p.konto_ab! < min ? p.konto_ab! : min), profile[0].konto_ab!);

  // Alle Zeiten seit dem frühesten „Konto ab“ bis gestern, seitenweise (die Datenbank liefert höchstens 1000 Zeilen)
  const nachPerson = new Map<string, KontoEintrag[]>();
  if (fruehester <= gestern) {
    for (let von = 0; ; von += SEITE) {
      const { data, error: zeitFehler } = await supabase
        .from("time_entries")
        .select("user_id, datum, art, stunden")
        .in("user_id", ids)
        .is("archiviert_am", null)
        .gte("datum", fruehester)
        .lte("datum", gestern)
        .order("datum")
        .order("id") // stabile Reihenfolge fürs seitenweise Laden
        .range(von, von + SEITE - 1);
      if (zeitFehler) throw new Error("Die Zeiten für das Überstundenkonto konnten nicht geladen werden.");
      for (const t of data) {
        const liste = nachPerson.get(t.user_id) ?? [];
        liste.push({ datum: t.datum, art: t.art, stunden: Number(t.stunden) });
        nachPerson.set(t.user_id, liste);
      }
      if (data.length < SEITE) break;
    }
  }

  const standard = standardSoll(einstellungen);
  const ergebnis = new Map<string, Konto>();
  for (const p of profile) {
    const konto = kontoBerechnen(
      {
        kontoAb: p.konto_ab,
        anfangssaldo: Number(p.konto_anfangssaldo),
        soll: sollAufloesen(
          [p.soll_mo, p.soll_di, p.soll_mi, p.soll_do, p.soll_fr].map(zahlOderNull) as SollEinstellung,
          standard,
        ),
        eintraege: nachPerson.get(p.id) ?? [],
        heute,
      },
      opts.monat,
    );
    if (konto && p.konto_ab) ergebnis.set(p.id, { ...konto, kontoAb: p.konto_ab });
  }
  return ergebnis;
}
