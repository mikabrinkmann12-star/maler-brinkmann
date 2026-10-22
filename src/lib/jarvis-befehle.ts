// Befehlserkennung für „Jarvis im Browser“ (ohne KI, ohne externen Dienst).
//
// Aus einem Satz wie „Notiz bei Gerdes: Gerüst steht“ wird ein BEFEHL mit Feldern (Intent + Felder). Die Erkennung arbeitet mit
// festen Regeln und dem unscharfen Namensabgleich der Einteilung (einteilung-erkennung.ts). Sie führt nichts aus, sondern liefert
// nur den Vorschlag; erst nach der Bestätigung des Nutzers passiert etwas (siehe Jarvis-Fenster).
//
// Austauschbar: Eine echte KI müsste nur dieselbe Schnittstelle liefern (`befehlErkennen(text, daten) → { befehl, hinweise }`).

import type { ContainerArt } from "@/lib/container";
import {
  einteilungErkennen,
  normalisieren,
  type EinteilungsGruppe,
  type ErkennungsFahrzeug,
  type ErkennungsMitarbeiter,
  type ErkennungsProjekt,
} from "@/lib/einteilung-erkennung";

export type JarvisDaten = {
  mitarbeiter: ErkennungsMitarbeiter[];
  fahrzeuge: ErkennungsFahrzeug[];
  projekte: ErkennungsProjekt[];
};

export type JarvisBefehl =
  | { art: "container"; container: ContainerArt }
  | { art: "notiz"; projektId: string; text: string }
  /** `tage` = Abstand zu heute (0 = heute, 1 = morgen) */
  | { art: "einteilung"; text: string; tage: number; gruppen: EinteilungsGruppe[] }
  | { art: "heute_wo"; tage: number }
  | { art: "urlaub_rest"; mitarbeiterId: string }
  | { art: "offen" }
  | { art: "projekt_oeffnen"; projektId: string }
  /**
   * Es fehlt etwas oder es ist mehrdeutig: Jarvis fragt nach, statt zu raten. Bei mehreren passenden Baustellen stehen sie in
   * `projektIds` und `dann` sagt, was nach der Wahl passiert (der Nutzer tippt die Baustelle an, es wird nichts geraten).
   */
  | { art: "nachfrage"; frage: string; projektIds?: string[]; dann?: { art: "notiz"; text: string } | { art: "projekt_oeffnen" } }
  | { art: "unbekannt" };

export type JarvisErgebnis = { befehl: JarvisBefehl; hinweise: string[] };

export const JARVIS_BEISPIELE = [
  "Papiercontainer melden",
  "Notiz bei Gerdes: Gerüst steht",
  "Sebastian und Jan mit Sprinter 1 zu Gerdes",
  "Wer ist heute wo?",
  "Wie viele Urlaubstage hat Christian noch?",
  "Was ist offen?",
  "Projekt Gerdes öffnen",
] as const;

// Wörter am Satzanfang, die nichts bedeuten
const FUELLWOERTER = new Set(["aeh", "aehm", "aehh", "hm", "hmm", "ehm", "also", "jarvis", "hey", "hallo", "ok", "okay", "bitte", "mal", "ja"]);
// Wörter zwischen „Notiz“ und der Baustelle bzw. vor „Notiz“
const NOTIZ_VORWOERTER = new Set(["neue", "eine", "schreibe", "schreib", "mach", "mache", "leg", "lege", "an", "notiere", "bitte"]);
const NOTIZ_NACH = new Set(["notiz", "notiere", "notier", "notizen"]);
const ORTSWOERTER = new Set(["bei", "beim", "zu", "zum", "zur", "fuer", "auf", "im", "in", "an", "am", "von", "vom", "projekt", "baustelle", "der", "die", "das", "dem", "den", "dass", "mit"]);
const TAGE: Record<string, number> = { gestern: -1, heute: 0, morgen: 1, uebermorgen: 2 };

function projektIds(text: string, daten: JarvisDaten): { ids: string[]; hinweise: string[]; mehrdeutig: string[] } {
  const e = einteilungErkennen(text, { mitarbeiter: [], fahrzeuge: [], projekte: daten.projekte });
  return {
    ids: [...new Set(e.gruppen.map((g) => g.projektId).filter((x): x is string => !!x))],
    hinweise: e.hinweise,
    mehrdeutig: e.mehrdeutigeProjekte,
  };
}

function tageAus(woerter: string[]): number {
  const wort = woerter.find((x) => x in TAGE);
  return wort ? TAGE[wort] : 0;
}

/** Notiz: „Notiz bei Gerdes: Gerüst steht“ – die Baustelle steht vorn, der Rest ist der Text. */
function notizLesen(token: string[], norm: string[], daten: JarvisDaten): JarvisBefehl | null {
  const stelle = norm.slice(0, 5).findIndex((n, i) => NOTIZ_NACH.has(n) && norm.slice(0, i).every((v) => NOTIZ_VORWOERTER.has(v) || FUELLWOERTER.has(v) || v === ""));
  if (stelle < 0) return null;

  let start = stelle + 1;
  while (start < token.length && (ORTSWOERTER.has(norm[start]) || norm[start] === "")) start++;
  if (start >= token.length) return { art: "nachfrage", frage: "Zu welcher Baustelle soll die Notiz? Sag es zum Beispiel so: „Notiz bei Gerdes: Gerüst steht“." };

  // Endet ein Wort mit „:“ oder „,“, ist danach die Baustelle zu Ende.
  let hoechstens = 3;
  for (let i = 0; i < 3 && start + i < token.length; i++) {
    if (/[:,;–—-]$/.test(token[start + i])) {
      hoechstens = i + 1;
      break;
    }
  }

  let mehrdeutig: string[] = [];
  for (let k = 1; k <= hoechstens && start + k <= token.length; k++) {
    const { ids, hinweise, mehrdeutig: kandidaten } = projektIds(token.slice(start, start + k).join(" "), daten);
    if (ids.length === 1 && hinweise.length === 0) {
      const text = token
        .slice(start + k)
        .join(" ")
        .replace(/^[\s:,;–—-]+/, "")
        .replace(/^dass\s+/i, "")
        .trim();
      if (!text) return { art: "nachfrage", frage: "Was soll in der Notiz stehen? Sag es zum Beispiel so: „Notiz bei Gerdes: Gerüst steht“." };
      return { art: "notiz", projektId: ids[0], text: text.charAt(0).toUpperCase() + text.slice(1) };
    }
    // Die erste Mehrdeutigkeit merken (das kürzeste Stück der Baustelle), längere Stücke engen sie nur ein
    if (!mehrdeutig.length) mehrdeutig = kandidaten.length ? kandidaten : ids.length > 1 ? ids : [];
  }
  if (mehrdeutig.length > 1) {
    // Der Text der Notiz beginnt nach dem Baustellen-Stück: nach Doppelpunkt/Komma, sonst nach dem ersten Wort
    const trenn = token.slice(start, start + hoechstens).findIndex((t) => /[:,;–—-]$/.test(t));
    const ab = start + (trenn >= 0 ? trenn + 1 : 1);
    const text = token.slice(ab).join(" ").replace(/^[\s:,;–—-]+/, "").replace(/^dass\s+/i, "").trim();
    return {
      art: "nachfrage",
      frage: "Welche Baustelle meinst du? Der Name passt zu mehreren.",
      projektIds: mehrdeutig,
      dann: text ? { art: "notiz", text: text.charAt(0).toUpperCase() + text.slice(1) } : undefined,
    };
  }
  return { art: "nachfrage", frage: "Diese Baustelle kenne ich nicht. Bitte nenne den Kunden, den Ort oder die Straße." };
}

/**
 * Erkennt, was gesagt oder getippt wurde. Reihenfolge: Notiz, Fragen (wer ist wo, Urlaub, was ist offen), Container, Öffnen, Einteilung.
 * Was nicht eindeutig ist, wird zur Nachfrage; was nicht passt, ist „unbekannt“. Es wird nie geraten.
 */
export function befehlErkennen(text: string, daten: JarvisDaten): JarvisErgebnis {
  const roh = text.trim();
  const alle = roh.split(/\s+/).filter(Boolean);
  const normAlle = alle.map((t) => normalisieren(t));
  // Füllwörter und die Anrede am Anfang weglassen
  let anfang = 0;
  while (anfang < alle.length && (FUELLWOERTER.has(normAlle[anfang]) || normAlle[anfang] === "")) anfang++;
  const token = alle.slice(anfang);
  const norm = normAlle.slice(anfang);
  const woerter = norm.flatMap((n) => n.split(" ")).filter(Boolean);
  if (!woerter.length) return { befehl: { art: "unbekannt" }, hinweise: [] };

  const hat = (...gesucht: string[]) => gesucht.some((g) => woerter.includes(g));
  const beginntMit = (...vorn: string[]) => woerter.some((w) => vorn.some((v) => w.startsWith(v)));
  const ergebnis = (befehl: JarvisBefehl, hinweise: string[] = []): JarvisErgebnis => ({ befehl, hinweise });

  // 1. Notiz
  const notiz = notizLesen(token, norm, daten);
  if (notiz) return ergebnis(notiz);

  // 2. Fragen
  if ((hat("wer") && hat("wo", "wohin", "faehrt", "eingeteilt", "arbeitet")) || (hat("wo") && hat(...Object.keys(TAGE))) ||
      (hat("einsaetze", "einteilung") && hat(...Object.keys(TAGE)) && !hat("mit", "zu", "nach"))) {
    return ergebnis({ art: "heute_wo", tage: tageAus(woerter) });
  }
  if (woerter.some((w) => w.includes("urlaub")) && (hat("wie", "viele", "viel", "wieviel", "wieviele", "noch", "rest", "uebrig") || beginntMit("resturlaub"))) {
    const e = einteilungErkennen(roh, { mitarbeiter: daten.mitarbeiter, fahrzeuge: [], projekte: [] });
    const ids = [...new Set(e.gruppen.flatMap((g) => g.mitarbeiterIds))];
    if (ids.length === 1) return ergebnis({ art: "urlaub_rest", mitarbeiterId: ids[0] });
    return ergebnis(
      { art: "nachfrage", frage: ids.length > 1 ? "Ich kann nur für eine Person auf einmal nachsehen. Für wen?" : "Für wen soll ich die Urlaubstage nachsehen? Sag zum Beispiel: „Wie viele Urlaubstage hat Christian noch?“" },
      e.hinweise,
    );
  }
  if ((hat("was") && hat("offen", "erledigen", "tun", "anliegt", "liegt", "anstehen", "neu", "los")) || beginntMit("offene")) {
    return ergebnis({ art: "offen" });
  }

  // 3. Container (Papier / Restmüll)
  if (beginntMit("container") || woerter.some((w) => w.endsWith("container"))) {
    const papier = woerter.some((w) => w.includes("papier"));
    const rest = woerter.some((w) => w.includes("restmuell") || w === "muell" || w === "rest");
    if (papier !== rest) return ergebnis({ art: "container", container: papier ? "papier" : "restmuell" });
    return ergebnis({ art: "nachfrage", frage: "Welchen Container soll ich melden: den Papiercontainer oder den Restmüllcontainer?" });
  }

  // 4. Projekt öffnen
  if (hat("oeffne", "oeffnen", "aufmachen", "zeig", "zeige", "zeigen", "anzeigen")) {
    const { ids, hinweise, mehrdeutig } = projektIds(roh, daten);
    if (ids.length === 1 && hinweise.length === 0) return ergebnis({ art: "projekt_oeffnen", projektId: ids[0] });
    const kandidaten = mehrdeutig.length ? mehrdeutig : ids;
    if (kandidaten.length > 1) {
      return ergebnis({ art: "nachfrage", frage: "Welches Projekt meinst du? Der Name passt zu mehreren.", projektIds: kandidaten, dann: { art: "projekt_oeffnen" } });
    }
    return ergebnis({ art: "nachfrage", frage: "Welches Projekt soll ich öffnen? Sag zum Beispiel: „Projekt Gerdes öffnen“." });
  }

  // 5. Einteilung (Personen mit Auto und/oder Baustelle)
  const e = einteilungErkennen(roh, daten);
  if (e.gruppen.some((g) => g.mitarbeiterIds.length > 0 && (g.fahrzeugId || g.projektId))) {
    return ergebnis({ art: "einteilung", text: roh, tage: tageAus(woerter), gruppen: e.gruppen }, e.hinweise);
  }

  return ergebnis({ art: "unbekannt" }, e.hinweise.filter((h) => !h.startsWith("Ich habe keine")));
}
