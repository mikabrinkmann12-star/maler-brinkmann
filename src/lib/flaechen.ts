// Reine Rechenfunktionen für die Flächen aus dem Grundriss. Kein "server-only", auch im Browser nutzbar.
import {
  FLAECHEN_STANDARD,
  type Bereich,
  type FlaechenStandard,
  type LeistungsZeile,
  type Raum,
  type RaumArt,
  type RaumFlaechen,
} from "./flaechen-typen";

/** Auf 2 Nachkommastellen runden. */
export function rund2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Flächen eines Raums berechnen; `geschaetzt` markiert nicht gemessene Werte. */
export function raumFlaechen(raum: Raum, std: FlaechenStandard): RaumFlaechen {
  const boden = raum.boden ?? 0;
  // Balkon, Terrasse, Dachterrasse: nur Boden, nie Decke, Wand oder Sockel
  if (raum.art === "aussen") {
    return { umfang: 0, boden: rund2(boden), decke: 0, wand: 0, sockel: 0, geschaetzt: { umfang: false, wand: false, decke: false, sockel: false } };
  }
  const umfangGemessen = raum.umfang != null && raum.umfang > 0;
  const umfang = umfangGemessen ? (raum.umfang as number) : std.umfangFaktor * Math.sqrt(Math.max(0, boden));
  const hoehe = raum.hoehe ?? std.raumhoehe;
  // Im Bad/WC zählt die Wand nur oberhalb der Fliesen.
  const wirksameHoehe = raum.art === "nass" ? Math.max(0, hoehe - std.fliesenhoehe) : hoehe;
  const wand = umfang * wirksameHoehe * (1 - std.abzugProzent / 100);

  let decke: number | null;
  if (raum.decke != null) decke = raum.decke;
  else if (raum.art === "treppenhaus") decke = null; // muss von Hand eingetragen werden
  else decke = boden;

  const sockel = raum.belag && raum.sockel ? umfang : 0;

  return {
    umfang: rund2(umfang),
    boden: rund2(boden),
    decke: decke == null ? null : rund2(decke),
    wand: rund2(wand),
    sockel: rund2(sockel),
    geschaetzt: { umfang: !umfangGemessen, wand: true, decke: false, sockel: sockel > 0 && !umfangGemessen },
  };
}

/** Raumart aus dem Namen vorschlagen. */
export function raumArtVorschlag(name: string): RaumArt {
  const n = name.toLowerCase();
  const davor = "(^|[^a-zäöüß])";
  const danach = "($|[^a-zäöüß])";
  // Zuerst Außenflächen („Dachterrasse“, „Terrasse (teilüberdacht)“, „Balkon“, „Loggia“)
  if (n.includes("terrasse") || n.includes("balkon") || n.includes("loggia")) return "aussen";
  if (
    new RegExp(davor + "bad").test(n) ||
    new RegExp(davor + "wc" + danach).test(n) ||
    n.includes("dusch") ||
    n.includes("toilett")
  )
    return "nass";
  if (n.includes("trepp")) return "treppenhaus";
  if (
    n.includes("technik") ||
    n.includes("hausanschluss") ||
    n.includes("heizung") ||
    new RegExp(davor + "har" + danach).test(n)
  )
    return "technik";
  return "normal";
}

/** Sockelleiste nur in normalen Räumen vorschlagen. */
export function sockelVorschlag(art: RaumArt): boolean {
  return art === "normal";
}

/** Räume eines Bereichs (alle, ein Geschoss, ausgewählte). */
export function bereichRaeume(raeume: Raum[], bereich: Bereich): Raum[] {
  if (bereich.art === "alle") return raeume;
  if (bereich.art === "geschoss") return raeume.filter((r) => r.geschoss === bereich.geschoss);
  return raeume.filter((r) => bereich.ids.includes(r.id));
}

/**
 * Menge einer Leistungszeile; bei Lücken kommt ein Fehlertext statt einer Zahl.
 * Es zählen NUR geprüfte Räume (ungeprüfte werden weggelassen und in `ausgelassen` genannt).
 * Außenflächen zählen bei Decke, Wand und Sockel nie mit.
 */
export function zeilenMenge(
  raeume: Raum[],
  zeile: LeistungsZeile,
  std: FlaechenStandard,
): { menge: number; fehler?: string; ausgelassen?: string[] } {
  const imBereich = bereichRaeume(raeume, zeile.bereich).filter((r) => zeile.flaeche === "boden" || r.art !== "aussen");
  const namen = (rs: Raum[]) => rs.map((r) => r.name || "ohne Namen").join(", ");
  if (imBereich.length === 0) return { menge: 0, fehler: "Im Bereich gibt es keine Räume." };
  const ausgelassen = imBereich.filter((r) => !r.geprueft).map((r) => r.name || "ohne Namen");
  const liste = imBereich.filter((r) => r.geprueft);
  if (liste.length === 0) return { menge: 0, fehler: "Im Bereich ist noch kein Raum geprüft.", ausgelassen };
  const ohneBoden = liste.filter((r) => r.boden == null || r.boden <= 0);
  if (ohneBoden.length) return { menge: 0, fehler: `Bodenfläche fehlt: ${namen(ohneBoden)}.` };
  const fl = liste.map((r) => ({ r, f: raumFlaechen(r, std) }));
  if (zeile.flaeche === "decke") {
    const ohneDecke = fl.filter((x) => x.f.decke == null).map((x) => x.r);
    if (ohneDecke.length) return { menge: 0, fehler: `Deckenfläche im Treppenhaus fehlt: ${namen(ohneDecke)}.` };
  }
  const summe = fl.reduce((s, x) => s + ((x.f[zeile.flaeche] as number | null) ?? 0), 0);
  return { menge: rund2(summe), ausgelassen: ausgelassen.length ? ausgelassen : undefined };
}

/** Summen je Geschoss (nur geprüfte Räume) für Decke, Wand und Sockel; `deckeFehlt` = geprüfter Raum ohne Decke (Treppenhaus). */
export function geschossSummen(raeume: Raum[], std: FlaechenStandard): { geschoss: string; decke: number; wand: number; sockel: number; deckeFehlt: boolean; geprueft: number; gesamt: number }[] {
  const namen = [...geschosse(raeume), ...(raeume.some((r) => !r.geschoss) ? [""] : [])];
  return namen.map((g) => {
    const alle = raeume.filter((r) => r.geschoss === g);
    const liste = alle.filter((r) => r.geprueft);
    const fl = liste.map((r) => raumFlaechen(r, std));
    return {
      geschoss: g,
      decke: rund2(fl.reduce((s, f) => s + (f.decke ?? 0), 0)),
      wand: rund2(fl.reduce((s, f) => s + f.wand, 0)),
      sockel: rund2(fl.reduce((s, f) => s + f.sockel, 0)),
      deckeFehlt: fl.some((f) => f.decke == null),
      geprueft: liste.length,
      gesamt: alle.length,
    };
  });
}

/** Geschosse in Reihenfolge des ersten Auftretens, ohne leere und Doppelte. */
export function geschosse(raeume: Raum[]): string[] {
  const aus: string[] = [];
  for (const r of raeume) if (r.geschoss && !aus.includes(r.geschoss)) aus.push(r.geschoss);
  return aus;
}

/** Eingestellte Standardwerte prüfen: nur endliche Zahlen in Grenzen, sonst Standard. */
export function standardPruefen(s: unknown): FlaechenStandard {
  const o = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
  const wert = (k: keyof FlaechenStandard, min: number, max: number): number => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : FLAECHEN_STANDARD[k];
  };
  return {
    umfangFaktor: wert("umfangFaktor", 3, 6),
    raumhoehe: wert("raumhoehe", 1.8, 6),
    abzugProzent: wert("abzugProzent", 0, 50),
    fliesenhoehe: wert("fliesenhoehe", 0, 3),
  };
}

/** Deutsche Zahl lesen ("12,5", "1.234,56"); leer, ungültig oder negativ = null. */
export function mengeLesen(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (!t) return null;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
