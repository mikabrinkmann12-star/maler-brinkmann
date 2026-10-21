// Einstellungen „Rechnungen – Vorgaben“ (wie in Plancraft: Zahlungsziel & Skonto der Firma, Mahnungen mit Frist, Verzugszinsen und Gebühr).
// Gespeichert in app_settings (Schlüssel „rechnungen“). Reine Logik, auch im Browser nutzbar.

import { z } from "zod";
import { zahlFuerFeld, zahlLesen } from "@/lib/angebot";

export type MahnungsStufe = { tage: number; zinsenProzent: number; gebuehr: number };

export type RechnungsEinstellungen = {
  /** Vorgabe der Firma, wenn der Kunde kein eigenes Zahlungsziel hat; leer = keine Vorgabe */
  zahlungszielTage: number | null;
  skontoProzent: number | null;
  skontoTage: number | null;
  erinnerung: MahnungsStufe;
  mahnung1: MahnungsStufe;
  mahnung2: MahnungsStufe;
  /** Anfangs- und Schlusstext, mit denen neue Rechnungen vorbelegt werden (im Rechnungsentwurf änderbar) und die an die Buchhaltung gehen */
  einleitung: string;
  schlusstext: string;
};

/** Texte für neue Rechnungen, wenn der Admin nichts eingetragen hat (die Zahlungsbedingungen hängt die App selbst an). */
export const STANDARD_RECHNUNGS_EINLEITUNG = "Vielen Dank für Ihren Auftrag. Hiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:";
export const STANDARD_RECHNUNGS_SCHLUSSTEXT = "Bitte überweisen Sie den Rechnungsbetrag unter Angabe der Rechnungsnummer auf das unten angegebene Konto.\n\nMit freundlichen Grüßen";

/** Startwerte wie in Plancraft (Zahlungserinnerung 7 Tage, 1./2. Mahnung 7 Tage, 0 % Zinsen, 3,00 € Gebühr). Zahlungsziel bleibt ohne Vorgabe. */
export const STANDARD_RECHNUNGSEINSTELLUNGEN: RechnungsEinstellungen = {
  zahlungszielTage: null,
  skontoProzent: null,
  skontoTage: null,
  erinnerung: { tage: 7, zinsenProzent: 0, gebuehr: 0 },
  mahnung1: { tage: 7, zinsenProzent: 0, gebuehr: 3 },
  mahnung2: { tage: 7, zinsenProzent: 0, gebuehr: 3 },
  einleitung: STANDARD_RECHNUNGS_EINLEITUNG,
  schlusstext: STANDARD_RECHNUNGS_SCHLUSSTEXT,
};

export const MAHN_STUFEN_NAMEN = { erinnerung: "Zahlungserinnerung", mahnung1: "1. Mahnung", mahnung2: "2. Mahnung" } as const;
export type MahnStufenSchluessel = keyof typeof MAHN_STUFEN_NAMEN;
export const MAHN_STUFEN: MahnStufenSchluessel[] = ["erinnerung", "mahnung1", "mahnung2"];

/** Die Stufen-Nummer einer Rechnung (1 = Erinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung) → Schlüssel */
export function stufeSchluessel(mahnstufe: number): MahnStufenSchluessel | null {
  return mahnstufe === 1 ? "erinnerung" : mahnstufe === 2 ? "mahnung1" : mahnstufe === 3 ? "mahnung2" : null;
}

const zahl = (wert: unknown, min: number, max: number, vorgabe: number): number =>
  typeof wert === "number" && Number.isFinite(wert) && wert >= min && wert <= max ? wert : vorgabe;

function stufeAusJson(wert: unknown, vorgabe: MahnungsStufe): MahnungsStufe {
  const o = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  return {
    tage: Math.round(zahl(o.tage, 0, 90, vorgabe.tage)),
    zinsenProzent: zahl(o.zinsen_prozent, 0, 100, vorgabe.zinsenProzent),
    gebuehr: zahl(o.gebuehr, 0, 1000, vorgabe.gebuehr),
  };
}

/** Gespeicherten Wert lesen; fehlende oder kaputte Teile fallen auf die Startwerte zurück. */
export function rechnungsEinstellungenAusJson(wert: unknown): RechnungsEinstellungen {
  const o = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  const s = STANDARD_RECHNUNGSEINSTELLUNGEN;
  const tage = typeof o.zahlungsziel_tage === "number" && Number.isInteger(o.zahlungsziel_tage) && o.zahlungsziel_tage >= 0 && o.zahlungsziel_tage <= 365 ? o.zahlungsziel_tage : null;
  const skontoOk =
    typeof o.skonto_prozent === "number" && o.skonto_prozent > 0 && o.skonto_prozent <= 100 &&
    typeof o.skonto_tage === "number" && Number.isInteger(o.skonto_tage) && o.skonto_tage > 0 && o.skonto_tage <= 365;
  return {
    zahlungszielTage: tage,
    skontoProzent: skontoOk ? (o.skonto_prozent as number) : null,
    skontoTage: skontoOk ? (o.skonto_tage as number) : null,
    erinnerung: stufeAusJson(o.erinnerung, s.erinnerung),
    mahnung1: stufeAusJson(o.mahnung1, s.mahnung1),
    mahnung2: stufeAusJson(o.mahnung2, s.mahnung2),
    // Ein ausdrücklich geleerter Text bleibt leer (dann nimmt die Buchhaltung ihren eigenen), nur „nie eingestellt“ nimmt den Standard
    einleitung: typeof o.einleitung === "string" ? o.einleitung.slice(0, 3000) : s.einleitung,
    schlusstext: typeof o.schlusstext === "string" ? o.schlusstext.slice(0, 3000) : s.schlusstext,
  };
}

export function rechnungsEinstellungenAlsJson(e: RechnungsEinstellungen) {
  const stufe = (m: MahnungsStufe) => ({ tage: m.tage, zinsen_prozent: m.zinsenProzent, gebuehr: m.gebuehr });
  return {
    zahlungsziel_tage: e.zahlungszielTage,
    skonto_prozent: e.skontoProzent,
    skonto_tage: e.skontoTage,
    erinnerung: stufe(e.erinnerung),
    mahnung1: stufe(e.mahnung1),
    mahnung2: stufe(e.mahnung2),
    einleitung: e.einleitung,
    schlusstext: e.schlusstext,
  };
}

// --- Eingabe (Formular, alles als Text mit deutschem Komma) ---

export type RechnungsEinstellungenEingabe = {
  zahlungszielTage: string;
  skontoProzent: string;
  skontoTage: string;
  einleitung: string;
  schlusstext: string;
} & Record<MahnStufenSchluessel, { tage: string; zinsenProzent: string; gebuehr: string }>;

export function eingabeAusEinstellungen(e: RechnungsEinstellungen): RechnungsEinstellungenEingabe {
  const stufe = (m: MahnungsStufe) => ({ tage: String(m.tage), zinsenProzent: zahlFuerFeld(m.zinsenProzent, 2), gebuehr: zahlFuerFeld(m.gebuehr, 2) });
  return {
    zahlungszielTage: e.zahlungszielTage === null ? "" : String(e.zahlungszielTage),
    skontoProzent: e.skontoProzent === null ? "" : zahlFuerFeld(e.skontoProzent, 2),
    skontoTage: e.skontoTage === null ? "" : String(e.skontoTage),
    erinnerung: stufe(e.erinnerung),
    mahnung1: stufe(e.mahnung1),
    mahnung2: stufe(e.mahnung2),
    einleitung: e.einleitung,
    schlusstext: e.schlusstext,
  };
}

const ganzzahl = (name: string, min: number, max: number) =>
  z.string().trim().transform((t, ctx) => {
    if (t === "") return null;
    if (!/^\d{1,4}$/.test(t) || Number(t) < min || Number(t) > max) {
      ctx.addIssue({ code: "custom", message: `${name}: Bitte eine ganze Zahl von ${min} bis ${max} eingeben.` });
      return z.NEVER;
    }
    return Number(t);
  });

const dezimal = (name: string, max: number) =>
  z.string().trim().transform((t, ctx) => {
    if (t === "") return 0;
    const n = zahlLesen(t, 2);
    if (n === null || n < 0 || n > max) {
      ctx.addIssue({ code: "custom", message: `${name}: Bitte eine Zahl von 0 bis ${max} eingeben (z. B. 3,00).` });
      return z.NEVER;
    }
    return n;
  });

const stufenSchema = (name: string) =>
  z.object({
    tage: ganzzahl(`${name}, Frist (Tage)`, 0, 90).transform((n) => n ?? 0),
    zinsenProzent: dezimal(`${name}, Verzugszinsen`, 100),
    gebuehr: dezimal(`${name}, Gebühr`, 1000),
  });

export const rechnungsEinstellungenSchema = z
  .object({
    zahlungszielTage: ganzzahl("Zahlungsziel", 0, 365),
    skontoProzent: z.string().trim().transform((t, ctx) => {
      if (t === "") return null;
      const n = zahlLesen(t, 2);
      if (n === null || n <= 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Skonto: Bitte eine Zahl größer 0 und höchstens 100 eingeben (z. B. 2)." });
        return z.NEVER;
      }
      return n;
    }),
    skontoTage: ganzzahl("Skonto-Frist", 1, 365),
    erinnerung: stufenSchema("Zahlungserinnerung"),
    mahnung1: stufenSchema("1. Mahnung"),
    mahnung2: stufenSchema("2. Mahnung"),
    einleitung: z.string().max(3000, "Anfangstext: höchstens 3.000 Zeichen.").transform((t) => t.replace(/\r\n/g, "\n").trim()),
    schlusstext: z.string().max(3000, "Schlusstext: höchstens 3.000 Zeichen.").transform((t) => t.replace(/\r\n/g, "\n").trim()),
  })
  .refine((d) => (d.skontoProzent === null) === (d.skontoTage === null), { message: "Skonto: Bitte Prozent und Frist (Tage) zusammen angeben oder beides leer lassen.", path: ["skontoTage"] })
  .refine((d) => d.skontoProzent === null || d.zahlungszielTage !== null, { message: "Skonto gibt es nur zusammen mit einem Zahlungsziel.", path: ["skontoProzent"] })
  .refine((d) => d.skontoTage === null || d.zahlungszielTage === null || d.skontoTage < d.zahlungszielTage, {
    message: "Die Skonto-Frist muss kürzer als das Zahlungsziel sein.",
    path: ["skontoTage"],
  });

export type RechnungsEinstellungenGeprueft = z.output<typeof rechnungsEinstellungenSchema>;

/** Geprüfte Eingabe → Einstellungen. */
export function einstellungenAusEingabe(d: RechnungsEinstellungenGeprueft): RechnungsEinstellungen {
  return {
    zahlungszielTage: d.zahlungszielTage,
    skontoProzent: d.skontoProzent,
    skontoTage: d.skontoTage,
    erinnerung: d.erinnerung,
    mahnung1: d.mahnung1,
    mahnung2: d.mahnung2,
    einleitung: d.einleitung,
    schlusstext: d.schlusstext,
  };
}

/** Hinweis für die Mahnung-Karte: „Frist 7 Tage, Gebühr 3,00 €, Verzugszinsen 0 %“ */
export function mahnungsHinweis(e: RechnungsEinstellungen, mahnstufe: number): string | null {
  const k = stufeSchluessel(mahnstufe);
  if (!k) return null;
  const m = e[k];
  const euro = m.gebuehr.toFixed(2).replace(".", ",");
  const zins = String(m.zinsenProzent).replace(".", ",");
  return `${MAHN_STUFEN_NAMEN[k]}: Frist ${m.tage} ${m.tage === 1 ? "Tag" : "Tage"}, Gebühr ${euro} €, Verzugszinsen ${zins} %`;
}
