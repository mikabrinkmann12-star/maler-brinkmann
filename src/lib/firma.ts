// Firmendaten und Angebots-Einstellungen (Admin pflegt sie unter Einstellungen).
// Die Werte stehen in app_settings (Schlüssel „firma“ und „angebote“), nie im Code.
// Auch im Browser nutzbar.

import { z } from "zod";
import { REVERSE_CHARGE_TEXT, STANDARD_EINLEITUNG, STANDARD_SCHLUSSTEXT } from "@/lib/angebot";
import { MAIL_STANDARD_BETREFF, MAIL_STANDARD_TEXT } from "@/lib/angebot-mail";

const text = (max: number, label: string) =>
  z.string({ error: `${label} fehlt.` }).trim().max(max, `${label}: höchstens ${max} Zeichen.`);

export const firmaSchema = z.object({
  name: text(100, "Firmenname").min(1, "Bitte den Firmennamen eingeben."),
  inhaber: text(100, "Inhaber"),
  strasse: text(100, "Straße"),
  plz: text(10, "PLZ"),
  ort: text(100, "Ort"),
  telefon: text(50, "Telefon"),
  email: text(100, "E-Mail"),
  website: text(100, "Webseite"),
  ustid: text(30, "USt-ID"),
  steuernummer: text(30, "Steuernummer"),
  bank: text(100, "Bank"),
  iban: text(40, "IBAN"),
  bic: text(20, "BIC"),
  /** Pfad der Logo-Datei im Bucket „firmenlogo“ (wird über den Logo-Bereich gesetzt, nicht im Formular) */
  logo: text(200, "Logo"),
});

/** Erlaubte Dateinamen des Logos im Bucket (PNG oder JPEG). */
export const LOGO_PFAD = /^logo-[a-z0-9-]{8,60}\.(png|jpg)$/;

export type Firma = z.infer<typeof firmaSchema>;

export const FIRMA_LEER: Firma = {
  name: "", inhaber: "", strasse: "", plz: "", ort: "", telefon: "", email: "", website: "",
  ustid: "", steuernummer: "", bank: "", iban: "", bic: "", logo: "",
};

export const angebotEinstellungenSchema = z.object({
  einleitung: text(3000, "Anfangstext"),
  schlusstext: text(3000, "Schlusstext"),
  reverse_charge_text: text(500, "Reverse-Charge-Hinweis").min(1, "Bitte den Reverse-Charge-Hinweis eingeben."),
  standard_steuersatz: z.union([z.literal(0), z.literal(7), z.literal(19)], { error: "Steuersatz: 0, 7 oder 19 %." }),
  mail_betreff: text(200, "E-Mail-Betreff").min(1, "Bitte den E-Mail-Betreff eingeben."),
  mail_text: text(5000, "E-Mail-Text").min(1, "Bitte den E-Mail-Text eingeben."),
  logo_anzeigen: z.boolean(),
  gueltigkeit_tage: z.number({ error: "Gültigkeit: bitte eine Zahl." }).int("Gültigkeit: bitte ganze Tage angeben.").min(0, "Gültigkeit: 0 bis 365 Tage.").max(365, "Gültigkeit: 0 bis 365 Tage."),
  standard_rabatt: z.number({ error: "Rabatt: bitte eine Zahl." }).min(0, "Rabatt: 0 bis 100 %.").max(100, "Rabatt: 0 bis 100 %."),
});

export type AngebotEinstellungen = z.infer<typeof angebotEinstellungenSchema>;

export const ANGEBOT_EINSTELLUNGEN_STANDARD: AngebotEinstellungen = {
  einleitung: STANDARD_EINLEITUNG,
  schlusstext: STANDARD_SCHLUSSTEXT,
  reverse_charge_text: REVERSE_CHARGE_TEXT,
  standard_steuersatz: 19,
  standard_rabatt: 0,
  mail_betreff: MAIL_STANDARD_BETREFF,
  mail_text: MAIL_STANDARD_TEXT,
  logo_anzeigen: true,
  gueltigkeit_tage: 30,
};

/** Gespeicherten Wert (jsonb) lesen; Fehlendes oder Ungültiges wird durch Standardwerte ersetzt. */
export function firmaAusWert(wert: unknown): Firma {
  const roh = typeof wert === "object" && wert !== null ? (wert as Record<string, unknown>) : {};
  const ergebnis = { ...FIRMA_LEER };
  for (const k of Object.keys(FIRMA_LEER) as (keyof Firma)[]) {
    if (typeof roh[k] === "string") ergebnis[k] = (roh[k] as string).slice(0, 500);
  }
  return ergebnis;
}

export function angebotEinstellungenAusWert(wert: unknown): AngebotEinstellungen {
  const roh = typeof wert === "object" && wert !== null ? (wert as Record<string, unknown>) : {};
  const s = ANGEBOT_EINSTELLUNGEN_STANDARD;
  const satz = roh.standard_steuersatz;
  const rabatt = roh.standard_rabatt;
  return {
    einleitung: typeof roh.einleitung === "string" ? roh.einleitung : s.einleitung,
    schlusstext: typeof roh.schlusstext === "string" ? roh.schlusstext : s.schlusstext,
    reverse_charge_text:
      typeof roh.reverse_charge_text === "string" && roh.reverse_charge_text.trim() ? roh.reverse_charge_text : s.reverse_charge_text,
    standard_steuersatz: satz === 0 || satz === 7 || satz === 19 ? satz : s.standard_steuersatz,
    standard_rabatt: typeof rabatt === "number" && rabatt >= 0 && rabatt <= 100 ? rabatt : s.standard_rabatt,
    gueltigkeit_tage: typeof roh.gueltigkeit_tage === "number" && Number.isInteger(roh.gueltigkeit_tage) && roh.gueltigkeit_tage >= 0 && roh.gueltigkeit_tage <= 365 ? roh.gueltigkeit_tage : s.gueltigkeit_tage,
    logo_anzeigen: typeof roh.logo_anzeigen === "boolean" ? roh.logo_anzeigen : s.logo_anzeigen,
    mail_betreff: typeof roh.mail_betreff === "string" && roh.mail_betreff.trim() ? roh.mail_betreff : s.mail_betreff,
    mail_text: typeof roh.mail_text === "string" && roh.mail_text.trim() ? roh.mail_text : s.mail_text,
  };
}

/** Absenderzeile über dem Empfänger: „Maler Betrieb Brinkmann | Zur Ziegelei 18 | 26683 Saterland“ */
export function absenderZeile(f: Firma): string {
  return [f.name, f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(" | ");
}
