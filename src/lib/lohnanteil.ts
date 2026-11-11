// Lohnanteil einer Rechnung (Lohnkosten nach § 35a EStG, wie in Plancraft „Lohnkostenanteil ausweisen“). Reine Logik, auch im Browser nutzbar.
// Je Position steht der Lohnanteil am Einzelpreis (netto, € je Einheit) in invoice_items.lohn_einzel. Er kommt aus der Kalkulation der
// Katalog-Leistung (Lohn-Anteil am Verkaufspreis), Material hat 0, freie Positionen sind unbekannt (null) und lassen sich im Entwurf eintragen.
// Gezählt wird nur der Lohn (keine Geräte, kein Material); ob Geräte- oder Fahrtkosten dazugehören, klärt der Steuerberater.

import { formatBetrag } from "@/lib/format";
import { kalkulieren, type KalkulationEingabe, type KalkulationEinstellungen } from "@/lib/kalkulation";
import type { RechnungsBaustein } from "@/lib/rechnung";

const cent = (w: number) => Math.round(w * 100 + Number.EPSILON * Math.sign(w)) / 100;

/** Anteil des Lohns am Verkaufspreis einer kalkulierten Leistung (0 bis 1); null = keine Kalkulation oder Preis 0. */
export function lohnQuoteAusKalkulation(k: KalkulationEingabe | null, einst: KalkulationEinstellungen): number | null {
  if (!k) return null;
  const r = kalkulieren(k, einst);
  return r.vkGesamt > 0 ? Math.min(1, Math.max(0, r.vk.lohn / r.vkGesamt)) : null;
}

/** Einheit „Std.“, „Std“, „Stunden“, „h“: eine freie Position in Stunden ist reiner Lohn. */
export function istStundenEinheit(einheit: string): boolean {
  return /^(std\.?|stunden?|h)$/i.test(einheit.trim());
}

/** Lohnanteil am Einzelpreis (auf 4 Stellen, nie mehr als der Preis); null bleibt null. */
export function lohnEinzelAusQuote(einzelpreis: number | null, quote: number | null): number | null {
  if (quote === null || einzelpreis === null) return null;
  return Math.min(einzelpreis, Math.round(einzelpreis * quote * 10_000) / 10_000);
}

export type Lohnanteil = { netto: number; ust: number; brutto: number; /** mindestens eine Position ohne Angabe (zählt als 0) */ unvollstaendig: boolean };

/** Lohnkosten der Rechnung: Menge × Lohnanteil je Position, abzüglich Rabatt, mit der Umsatzsteuer der Rechnung (bei Reverse-Charge keine). */
export function lohnanteilBerechnen(
  bausteine: readonly RechnungsBaustein[],
  o: { rabattProzent: number; steuersatz: number; reverseCharge: boolean },
): Lohnanteil {
  let summe = 0;
  let unvollstaendig = false;
  for (const b of bausteine) {
    if (b.typ !== "position") continue;
    if (b.lohnEinzel == null) {
      unvollstaendig = true;
      continue;
    }
    summe += cent((b.menge ?? 0) * b.lohnEinzel);
  }
  const netto = cent(summe * (1 - o.rabattProzent / 100));
  const ust = o.reverseCharge ? 0 : cent((netto * o.steuersatz) / 100);
  return { netto, ust, brutto: cent(netto + ust), unvollstaendig };
}

/** Soll der Lohnanteil auf dieser Rechnung stehen? Nach Einstellung getrennt für Privatpersonen und Firmen. */
export function lohnanteilZeigen(e: { lohnPrivat: boolean; lohnFirma: boolean }, kundeTyp: string): boolean {
  return kundeTyp === "firma" ? e.lohnFirma : e.lohnPrivat;
}

/**
 * Satz für die Rechnung, z. B. „In diesem Rechnungsbetrag sind Lohnkosten (§ 35a EStG) von 1.000,00 € netto zzgl. 190,00 € USt,
 * zusammen 1.190,00 €, enthalten.“ Bei der Schlussrechnung wird der Lohn abgezogen, der schon mit den Abschlägen ausgewiesen wurde.
 * null = kein Lohn (dann kein Satz).
 */
export function lohnanteilText(l: Lohnanteil, abschlaegeBrutto = 0): string | null {
  if (l.brutto <= 0) return null;
  const mitUst = l.ust > 0 ? `${formatBetrag(l.netto)} netto zzgl. ${formatBetrag(l.ust)} USt, zusammen ${formatBetrag(l.brutto)}` : formatBetrag(l.brutto);
  if (abschlaegeBrutto > 0) {
    const rest = Math.max(0, cent(l.brutto - abschlaegeBrutto));
    return `Die Leistung enthält Lohnkosten (Arbeitskosten nach § 35a EStG) von ${mitUst}. Davon wurden mit den Abschlagsrechnungen bereits ${formatBetrag(abschlaegeBrutto)} ausgewiesen, auf diese Rechnung entfallen ${formatBetrag(rest)}.`;
  }
  return `In diesem Rechnungsbetrag sind Lohnkosten (Arbeitskosten nach § 35a EStG) von ${mitUst} enthalten.`;
}
