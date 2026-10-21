// „Preis anpassen“ wie in Plancraft: Die Nettosumme eines Angebots auf einen Zielwert bringen, indem alle Einzelpreise der Positionen
// mit demselben Faktor umgerechnet werden („Preisanpassung auf alle Positionen umverteilen“). Reine Logik, getestet.
// Gerechnet wird mit ganzen Cent; ein Rundungsrest wird auf eine Position gelegt, die ihn genau ausgleichen kann (kleine Menge zuerst).

import { positionCent } from "@/lib/angebot";

export type PreisPosition = { id: string; menge: number; einzelpreis: number };

export type PreisAnpassung = {
  /** Neue Einzelpreise (nur Positionen, deren Preis sich ändert) */
  neuePreise: { id: string; einzelpreis: number }[];
  /** Nettosumme (vor Rabatt) nach der Anpassung, in Euro */
  nettoNachher: number;
  /** Abweichung zum Ziel in Euro (0 = genau getroffen) */
  rest: number;
};

const euro = (cent: number) => Math.round(cent) / 100;
const summeCent = (p: readonly PreisPosition[], preise: Map<string, number>) =>
  p.reduce((s, x) => s + positionCent(x.menge, preise.get(x.id) ?? x.einzelpreis), 0);

/**
 * Bringt die Nettosumme der Positionen (vor Rabatt) auf `zielNetto`. Positionen mit Menge 0 oder Preis 0 bleiben unverändert.
 * Gibt null zurück, wenn es nichts zu verteilen gibt (keine bepreisten Positionen) oder das Ziel nicht sinnvoll ist (negativ).
 */
export function preisAnpassen(positionen: readonly PreisPosition[], zielNetto: number): PreisAnpassung | null {
  const bepreist = positionen.filter((p) => p.menge > 0 && p.einzelpreis > 0);
  const jetztCent = summeCent(bepreist, new Map());
  if (!(zielNetto >= 0) || jetztCent <= 0) return null;
  const zielCent = Math.round(zielNetto * 100);
  const faktor = zielCent / jetztCent;

  const preise = new Map<string, number>();
  for (const p of bepreist) preise.set(p.id, Math.max(0, Math.round(p.einzelpreis * faktor * 100) / 100));

  // Rest der Rundung ausgleichen: Positionen mit kleiner Menge zuerst (dort bewegt ein Cent Einzelpreis die Summe am feinsten),
  // gesucht wird ein Einzelpreis, der den Rest genau trifft; sonst der beste Näherungswert über alle Positionen.
  let rest = zielCent - summeCent(bepreist, preise);
  if (rest !== 0) {
    const basis = summeCent(bepreist, preise);
    let beste: { id: string; preis: number; abweichung: number } | null = null;
    for (const p of [...bepreist].sort((x, y) => x.menge - y.menge)) {
      const ohne = basis - positionCent(p.menge, preise.get(p.id)!);
      const start = preise.get(p.id)!;
      for (let schritt = -300; schritt <= 300; schritt++) {
        const preis = Math.round((start + schritt / 100) * 100) / 100;
        if (preis <= 0) continue;
        const abweichung = Math.abs(zielCent - (ohne + positionCent(p.menge, preis)));
        if (!beste || abweichung < beste.abweichung) beste = { id: p.id, preis, abweichung };
        if (abweichung === 0) break;
      }
      if (beste?.abweichung === 0) break;
    }
    if (beste && beste.abweichung < Math.abs(rest)) preise.set(beste.id, beste.preis);
    rest = zielCent - summeCent(bepreist, preise);
  }

  const neuePreise = bepreist.filter((p) => preise.get(p.id) !== p.einzelpreis).map((p) => ({ id: p.id, einzelpreis: preise.get(p.id)! }));
  return { neuePreise, nettoNachher: euro(summeCent(bepreist, preise)), rest: euro(rest) };
}

/** Zielsumme aus einem Zuschlag in Prozent (negativ = Abschlag) auf die jetzige Nettosumme. */
export function zielAusZuschlag(nettoJetzt: number, prozent: number): number {
  return Math.round(nettoJetzt * (1 + prozent / 100) * 100) / 100;
}
