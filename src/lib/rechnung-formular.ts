// Startwerte für das Rechnungsformular (Zahlen und Daten als Eingabetext). Auch im Browser nutzbar.

import { zahlFuerFeld } from "@/lib/angebot";
import type { SteuerAuswahl } from "@/lib/angebot-schema";

export type RechnungKopfStart = {
  betreff: string;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string;
  zahlungsziel: string;
  skontoProzent: string;
  skontoTage: string;
  steuer: SteuerAuswahl;
  rabatt: string;
  einleitung: string;
  schlusstext: string;
};

export function kopfStart(r: {
  betreff: string; rechnungsdatum: string; leistungVon: string; leistungBis: string; zahlungszielTage: number;
  skontoProzent: number | null; skontoTage: number | null; steuer: SteuerAuswahl; rabattProzent: number; einleitung: string; schlusstext: string;
}): RechnungKopfStart {
  return {
    betreff: r.betreff,
    rechnungsdatum: r.rechnungsdatum,
    leistungVon: r.leistungVon,
    leistungBis: r.leistungBis,
    zahlungsziel: String(r.zahlungszielTage),
    skontoProzent: r.skontoProzent == null ? "" : zahlFuerFeld(r.skontoProzent),
    skontoTage: r.skontoTage == null ? "" : String(r.skontoTage),
    steuer: r.steuer,
    rabatt: r.rabattProzent === 0 ? "" : zahlFuerFeld(r.rabattProzent),
    einleitung: r.einleitung,
    schlusstext: r.schlusstext,
  };
}
