// Reine Rechenfunktionen für die Flächen aus dem Grundriss. Kein "server-only", auch im Browser nutzbar.
import {
  FLAECHEN_STANDARD,
  NASS_ARTEN,
  WOHNUNGS_ARTEN,
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
  // Balkon, Terrasse, Dachterrasse: zählt nirgends
  if (raum.art === "aussen") {
    return { umfang: 0, boden: 0, decke: 0, wand: 0, sockel: 0, geschaetzt: { umfang: false, wand: false, decke: false, sockel: false } };
  }
  const umfangGemessen = raum.umfang != null && raum.umfang > 0;
  const umfang = umfangGemessen ? (raum.umfang as number) : std.umfangFaktor * Math.sqrt(Math.max(0, boden));
  const hoehe = raum.hoehe ?? std.raumhoehe;
  // Im Bad/WC zählt die Wand nur oberhalb der Fliesen.
  const wirksameHoehe = NASS_ARTEN.includes(raum.art) ? Math.max(0, hoehe - std.fliesenhoehe) : hoehe;
  const wand = umfang * wirksameHoehe * (1 - std.abzugProzent / 100);

  let decke: number | null;
  if (raum.decke != null) decke = raum.decke;
  else if (raum.art === "treppenhaus") decke = null; // muss von Hand eingetragen werden
  else decke = boden;

  const sockel = raum.sockel ? umfang : 0;

  return {
    umfang: rund2(umfang),
    boden: rund2(boden),
    decke: decke == null ? null : rund2(decke),
    wand: rund2(wand),
    sockel: rund2(sockel),
    geschaetzt: { umfang: !umfangGemessen, wand: true, decke: false, sockel: sockel > 0 && !umfangGemessen },
  };
}

/** Sockelleiste nur in Wohnräumen vorschlagen. */
export function sockelVorschlag(art: RaumArt): boolean {
  return art === "wohnraum";
}

const istWohnung = (r: Raum) => WOHNUNGS_ARTEN.includes(r.art);

/** Räume eines Bereichs. Außenflächen sind nie dabei. */
export function bereichRaeume(raeume: Raum[], bereich: Bereich): Raum[] {
  switch (bereich.art) {
    case "wohnungen":
      return raeume.filter(
        (r) =>
          istWohnung(r) &&
          (bereich.geschoss === undefined || r.geschoss === bereich.geschoss) &&
          (!bereich.ohneNass || !NASS_ARTEN.includes(r.art)),
      );
    case "wohnung":
      return raeume.filter((r) => istWohnung(r) && r.wohnung === bereich.wohnung);
    case "raumart":
      return raeume.filter((r) => r.art === bereich.raumArt);
    case "raeume":
      return raeume.filter((r) => bereich.ids.includes(r.id) && r.art !== "aussen");
  }
}

/** Menge einer Leistungszeile; bei Lücken kommt ein Fehlertext statt einer Zahl. */
export function zeilenMenge(raeume: Raum[], zeile: LeistungsZeile, std: FlaechenStandard): { menge: number; fehler?: string } {
  const liste = bereichRaeume(raeume, zeile.bereich);
  const namen = (rs: Raum[]) => rs.map((r) => r.name || "ohne Namen").join(", ");
  if (liste.length === 0) return { menge: 0, fehler: "Im Bereich gibt es keine Räume." };
  const ohneBoden = liste.filter((r) => r.boden == null || r.boden <= 0);
  if (ohneBoden.length) return { menge: 0, fehler: `Bodenfläche fehlt: ${namen(ohneBoden)}.` };
  const fl = liste.map((r) => ({ r, f: raumFlaechen(r, std) }));
  if (zeile.flaeche === "decke") {
    const ohneDecke = fl.filter((x) => x.f.decke == null).map((x) => x.r);
    if (ohneDecke.length) return { menge: 0, fehler: `Deckenfläche im Treppenhaus fehlt: ${namen(ohneDecke)}.` };
  }
  const summe = fl.reduce((s, x) => s + ((x.f[zeile.flaeche] as number | null) ?? 0), 0);
  return { menge: rund2(summe) };
}

export type WohnSumme = { boden: number; bodenOhneNass: number; decke: number; wand: number; sockel: number; deckeFehlt: boolean };

function wohnSumme(liste: Raum[], std: FlaechenStandard): WohnSumme {
  const fl = liste.map((r) => ({ r, f: raumFlaechen(r, std) }));
  const sum = (k: "boden" | "wand" | "sockel", nurTrocken = false) =>
    rund2(fl.filter((x) => !nurTrocken || !NASS_ARTEN.includes(x.r.art)).reduce((s, x) => s + x.f[k], 0));
  return {
    boden: sum("boden"),
    bodenOhneNass: sum("boden", true),
    decke: rund2(fl.reduce((s, x) => s + (x.f.decke ?? 0), 0)),
    wand: sum("wand"),
    sockel: sum("sockel"),
    deckeFehlt: fl.some((x) => x.f.decke == null),
  };
}

/** Summen: je Geschoss und gesamt nur Wohnungsräume, Sonderräume getrennt, Außenflächen nur informativ. */
export function flaechenSummen(
  raeume: Raum[],
  std: FlaechenStandard,
): {
  geschosse: (WohnSumme & { geschoss: string })[];
  wohnungen: WohnSumme;
  sonderraeume: { art: "treppenhaus" | "technik" | "nebengebaeude"; boden: number; anzahl: number }[];
  aussen: { boden: number; anzahl: number };
} {
  const wohn = raeume.filter(istWohnung);
  const namen = [...geschosse(wohn), ...(wohn.some((r) => !r.geschoss) ? [""] : [])];
  const sonder = (["treppenhaus", "technik", "nebengebaeude"] as const)
    .map((art) => {
      const l = raeume.filter((r) => r.art === art);
      return { art, boden: rund2(l.reduce((s, r) => s + (r.boden ?? 0), 0)), anzahl: l.length };
    })
    .filter((x) => x.anzahl > 0);
  const aussenListe = raeume.filter((r) => r.art === "aussen");
  return {
    geschosse: namen.map((g) => ({ geschoss: g, ...wohnSumme(wohn.filter((r) => r.geschoss === g), std) })),
    wohnungen: wohnSumme(wohn, std),
    sonderraeume: sonder,
    aussen: { boden: rund2(aussenListe.reduce((s, r) => s + (r.boden ?? 0), 0)), anzahl: aussenListe.length },
  };
}

/** Geschosse in Reihenfolge des ersten Auftretens, ohne leere und Doppelte. */
export function geschosse(raeume: Raum[]): string[] {
  const aus: string[] = [];
  for (const r of raeume) if (r.geschoss && !aus.includes(r.geschoss)) aus.push(r.geschoss);
  return aus;
}

/** Wohnungen (nicht leere Namen der Wohnungsräume) in Reihenfolge des ersten Auftretens, ohne Doppelte. */
export function wohnungen(raeume: Raum[]): string[] {
  const aus: string[] = [];
  for (const r of raeume) if (istWohnung(r) && r.wohnung && !aus.includes(r.wohnung)) aus.push(r.wohnung);
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
