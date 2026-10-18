import { z } from "zod";

// Eingabeprüfung für Kontakte (Server). Zwei Varianten: Formular (streng) und Import (großzügig,
// weil alte Daten manchmal unsaubere E-Mail-Adressen o. Ä. enthalten).

const text = (max: number, meldung: string) => z.string().trim().max(max, meldung).default("");

const basis = z.object({
  typ: z.enum(["privat", "firma"], { error: "Bitte Privat oder Firma wählen." }),
  kundennummer: z
    .string()
    .trim()
    .max(40, "Die Kundennummer ist zu lang.")
    .nullish()
    .transform((v) => (v ? v : null)),
  firmenname: text(120, "Der Firmenname ist zu lang."),
  anrede: text(100, "Die Anrede ist zu lang."),
  vorname: text(80, "Der Vorname ist zu lang."),
  nachname: text(80, "Der Nachname ist zu lang."),
  strasse: text(120, "Die Straße ist zu lang."),
  plz: text(10, "Die PLZ ist zu lang."),
  ort: text(80, "Der Ort ist zu lang."),
  land: z.string().trim().max(60, "Das Land ist zu lang.").default("").transform((l) => l || "Deutschland"),
  /** Farbpunkt wie in Plancraft; leer = keine Farbe */
  farbe: z.enum(["", "rot", "orange", "gruen", "blau", "lila", "grau"], { error: "Ungültige Farbe." }).default(""),
  ansprechpartner: text(120, "Der Ansprechpartner ist zu lang."),
  telefon: text(40, "Die Telefonnummer ist zu lang."),
  mobil: text(40, "Die Handynummer ist zu lang."),
  notizen: text(2000, "Die Notizen sind zu lang (höchstens 2.000 Zeichen)."),
  website: text(200, "Die Webseite ist zu lang."),
  /** Briefanschrift von Hand; leer = automatisch aus Anrede, Name und Adresse */
  empfaenger: text(400, "Der Empfänger ist zu lang."),
  zahlungsziel_tage: z.number().int("Bitte ganze Tage angeben.").min(0).max(365, "Höchstens 365 Tage.").nullish().transform((v) => v ?? null),
  skonto_prozent: z.number().min(0).max(20, "Skonto höchstens 20 %.").nullish().transform((v) => v ?? null),
  skonto_tage: z.number().int("Bitte ganze Tage angeben.").min(0).max(365, "Höchstens 365 Tage.").nullish().transform((v) => v ?? null),
  steuersatz: z.union([z.literal(0), z.literal(7), z.literal(19)], { error: "Steuersatz: 0, 7 oder 19 %." }).default(19),
  /** Leitweg-ID für Rechnungen an Behörden (XRechnung), z. B. 04011000-1234512345-35; leer = keine */
  leitweg_id: z.string().trim().max(46, "Die Leitweg-ID ist zu lang.").regex(/^$|^[0-9A-Za-z-]{5,46}$/, "Die Leitweg-ID darf nur Ziffern, Buchstaben und Bindestriche enthalten (mindestens 5 Zeichen).").default(""),
});

const mussNamenHaben = (k: { firmenname: string; nachname: string }) => Boolean(k.firmenname || k.nachname);
const skontoPaar = (k: { skonto_prozent: number | null; skonto_tage: number | null }) => (k.skonto_prozent === null) === (k.skonto_tage === null);
const SKONTO_MELDUNG = "Skonto braucht Prozent und Tage (oder beides leer lassen).";
const NAME_MELDUNG = "Bitte einen Firmennamen oder einen Nachnamen eingeben.";

export const kontaktSchema = basis
  .extend({
    email: z
      .string()
      .trim()
      .default("")
      .pipe(z.union([z.literal(""), z.email("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).")])),
  })
  .refine(mussNamenHaben, { message: NAME_MELDUNG, path: ["nachname"] })
  .refine(skontoPaar, { message: SKONTO_MELDUNG, path: ["skonto_tage"] });

export const importKontaktSchema = basis
  .extend({ email: text(200, "Die E-Mail ist zu lang.") })
  .refine(mussNamenHaben, { message: NAME_MELDUNG, path: ["nachname"] });

export type KontaktImportDaten = z.output<typeof importKontaktSchema>;

export type KontaktDaten = z.output<typeof kontaktSchema>;

/** Anzeigename: Firma oder „Vorname Nachname“. */
export function kontaktAnzeigename(k: { firmenname?: string | null; vorname?: string | null; nachname?: string | null }): string {
  return k.firmenname?.trim() || [k.vorname, k.nachname].filter(Boolean).join(" ").trim() || "Ohne Namen";
}

/** Mehrzeilige Briefanschrift („Empfänger“): Anrede, Name, Straße, PLZ Ort. */
export function briefanschrift(k: {
  typ: string;
  anrede?: string | null;
  firmenname?: string | null;
  ansprechpartner?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  land?: string | null;
  empfaenger?: string | null;
}): string[] {
  // Von Hand eingetragener Empfänger geht vor
  if (k.empfaenger?.trim()) return k.empfaenger.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  const kopf = k.typ === "firma"
    ? [k.firmenname, k.ansprechpartner && `z. Hd. ${k.ansprechpartner}`]
    : [k.anrede, [k.vorname, k.nachname].filter(Boolean).join(" ")];
  const ausland = k.land && k.land !== "Deutschland" ? k.land : null;
  return [...kopf, k.strasse, [k.plz, k.ort].filter(Boolean).join(" "), ausland].filter((z): z is string => Boolean(z && z.trim()));
}
