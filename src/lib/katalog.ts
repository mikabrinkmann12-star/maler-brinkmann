// Katalog: Preisrechnung, Eingaben lesen, Ordner-Baum (auch im Browser nutzbar).
// Verbindlich rechnet die Datenbank (generierte Spalte `vk`); diese Funktionen
// spiegeln die Regel für die Vorschau im Formular.

export type KatalogArt = "material" | "leistung";

export const KATALOG_ART_NAMEN: Record<KatalogArt, string> = {
  material: "Materialien",
  leistung: "Leistungen",
};

export function istKatalogArt(wert: unknown): wert is KatalogArt {
  return wert === "material" || wert === "leistung";
}

/** Vorgeschlagene Einheiten (die Spalte ist freier Text bis 20 Zeichen). */
export const EINHEITEN: Record<KatalogArt, string[]> = {
  material: ["Stk", "Eimer", "Liter", "kg", "Rolle", "Kartusche", "Packung", "Sack", "m", "m²", "Satz"],
  leistung: ["m²", "m", "Std", "Stk", "psch", "Tag", "Satz"],
};

export const MAX_PREIS = 1_000_000;
export const MAX_ZUSCHLAG = 999;

// ---------------------------------------------------------------------------
// Eingaben lesen
// ---------------------------------------------------------------------------

/**
 * Preis aus deutscher Eingabe lesen: „12,5“, „1.234,56“, „12.50“, „12,50 €“ → Zahl mit höchstens
 * 4 Nachkommastellen. Mit Komma sind Punkte Tausendertrenner; ohne Komma gilt ein einzelner Punkt
 * mit genau drei Ziffern danach als Tausendertrenner („1.234“ = 1234), sonst als Dezimalpunkt.
 * Unlesbar oder negativ → null.
 */
export function preisLesen(text: string): number | null {
  const t = text.replace(/[€\s]|eur$/gi, "");
  if (t === "") return null;
  let normal: string;
  if (t.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,4}$|^\d+,\d{1,4}$/.test(t)) return null;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, "");
  } else if (/^\d+(\.\d{1,4})?$/.test(t)) {
    normal = t;
  } else {
    return null;
  }
  const wert = Number(normal);
  return Number.isFinite(wert) ? wert : null;
}

/** Zuschlag in Prozent lesen: „25“, „12,5“, „30 %“ → Zahl mit höchstens 2 Nachkommastellen, 0 bis 999. */
export function zuschlagLesen(text: string): number | null {
  const t = text.replace(/[%\s]/g, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const wert = Number(t);
  return wert <= MAX_ZUSCHLAG ? wert : null;
}

// ---------------------------------------------------------------------------
// Preisrechnung
// ---------------------------------------------------------------------------

/**
 * Verkaufspreis in Euro: Einkaufspreis × (1 + Zuschlag %), auf Cent gerundet (kaufmännisch, 0,5 rundet auf).
 * Gleiche Regel wie die generierte Spalte `vk` in der Datenbank. Gerechnet wird mit ganzen Zahlen,
 * damit keine Fließkomma-Fehler entstehen (z. B. 0,1 + 0,2).
 */
export function vkBerechnen(ek: number, zuschlagProzent: number): number {
  const ekZehntausendstel = Math.round(ek * 10_000);
  const zuschlagHundertstel = Math.round(zuschlagProzent * 100);
  const produkt = ekZehntausendstel * (10_000 + zuschlagHundertstel); // in 1e-8 Euro
  const cent = Math.floor((produkt + 500_000) / 1_000_000);
  return cent / 100;
}

/** Preis für die Anzeige im Eingabefeld: bis 4 Nachkommastellen, mindestens 2, ohne Tausenderpunkte. */
export function preisFuerFeld(wert: number): string {
  const text = String(Math.round(wert * 10_000) / 10_000);
  const [ganz, nach = ""] = text.split(".");
  return `${ganz},${nach.padEnd(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Ordner
// ---------------------------------------------------------------------------
export type OrdnerEintrag = { id: string; parentId: string | null; name: string };

const nachName = (a: OrdnerEintrag, b: OrdnerEintrag) => a.name.localeCompare(b.name, "de");

/** Direkte Unterordner (alphabetisch). `parentId` null = oberste Ebene. */
export function unterordner(ordner: OrdnerEintrag[], parentId: string | null): OrdnerEintrag[] {
  return ordner.filter((o) => o.parentId === parentId).sort(nachName);
}

/** Namen vom obersten Ordner bis zu diesem. Unbekannte ID → leere Liste. */
export function ordnerPfad(ordner: OrdnerEintrag[], id: string | null): OrdnerEintrag[] {
  const pfad: OrdnerEintrag[] = [];
  const nachId = new Map(ordner.map((o) => [o.id, o]));
  let aktuell = id ? nachId.get(id) : undefined;
  // Die Begrenzung schützt vor Endlosschleifen bei kaputten Daten (die Datenbank verhindert Schleifen).
  for (let i = 0; aktuell && i < 50; i++) {
    pfad.unshift(aktuell);
    aktuell = aktuell.parentId ? nachId.get(aktuell.parentId) : undefined;
  }
  return pfad;
}

export function ordnerPfadText(ordner: OrdnerEintrag[], id: string | null): string {
  return ordnerPfad(ordner, id).map((o) => o.name).join(" › ");
}

/** Alle Nachfahren eines Ordners (ohne ihn selbst). */
export function nachfahrenIds(ordner: OrdnerEintrag[], id: string): string[] {
  const ergebnis: string[] = [];
  const offen = [id];
  while (offen.length) {
    const aktuell = offen.pop()!;
    for (const o of ordner) {
      if (o.parentId === aktuell && !ergebnis.includes(o.id)) {
        ergebnis.push(o.id);
        offen.push(o.id);
      }
    }
  }
  return ergebnis;
}

/**
 * Auswahlliste aller Ordner als „Farben › Dispersion“, nach Pfad sortiert.
 * `ausser`: dieser Ordner und seine Unterordner fehlen (zum Verschieben, sonst gäbe es Schleifen).
 */
export function ordnerOptionen(ordner: OrdnerEintrag[], ausser?: string): { id: string; text: string }[] {
  const gesperrt = new Set(ausser ? [ausser, ...nachfahrenIds(ordner, ausser)] : []);
  return ordner
    .filter((o) => !gesperrt.has(o.id))
    .map((o) => ({ id: o.id, text: ordnerPfadText(ordner, o.id) }))
    .sort((a, b) => a.text.localeCompare(b.text, "de"));
}
