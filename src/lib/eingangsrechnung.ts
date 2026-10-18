// Eingangsrechnungen (Rechnungen von Lieferanten, wie in Plancraft): Status, Zuweisung, Filter und Eingabeprüfung.
// Reine Logik, auch im Browser nutzbar. Keine Buchhaltung: Die bleibt in Lexware.

import { z } from "zod";
import { tageZwischen } from "@/lib/datum";
import { einzelpreisLesen } from "@/lib/angebot";
import { suchtext } from "@/lib/suche";

export type Zahlstatus = "offen" | "bezahlt";
export type EingangAnzeige = "offen" | "ueberfaellig" | "bezahlt";
export type Bereich = "lager" | "buero" | "mitarbeiter";

export const BEREICH_NAMEN: Record<Bereich, string> = { lager: "Lager", buero: "Büro", mitarbeiter: "Mitarbeiter" };
export const BEREICHE = Object.keys(BEREICH_NAMEN) as Bereich[];

export const EINGANG_ANZEIGE_NAMEN: Record<EingangAnzeige, string> = { offen: "Offen", ueberfaellig: "Überfällig", bezahlt: "Bezahlt" };
/** Farben wie bei den Ausgangsrechnungen: Offen blau, Überfällig gelb, Bezahlt grün. */
export const EINGANG_ANZEIGE_FARBEN: Record<EingangAnzeige, string> = { offen: "#3b82f6", ueberfaellig: "#d99a1c", bezahlt: "#3fa66a" };

export function istEingangAnzeige(wert: unknown): wert is EingangAnzeige {
  return typeof wert === "string" && wert in EINGANG_ANZEIGE_NAMEN;
}

export type EingangZeile = {
  id: string;
  lieferant: string;
  rechnungsnummer: string;
  rechnungsdatum: string | null;
  faelligAm: string | null;
  netto: number | null;
  brutto: number | null;
  zahlstatus: Zahlstatus;
  projectId: string | null;
  projektText: string;
  bereich: Bereich | null;
  zuPruefen: boolean;
  dateiname: string;
  quelle: "upload" | "email";
  hochgeladenAm: string;
  hochgeladenVon: string;
};

/** Offen, Überfällig (Fälligkeit liegt vor heute) oder Bezahlt. */
export function eingangAnzeige(z: Pick<EingangZeile, "zahlstatus" | "faelligAm">, heute: string): EingangAnzeige {
  if (z.zahlstatus === "bezahlt") return "bezahlt";
  return z.faelligAm && z.faelligAm < heute ? "ueberfaellig" : "offen";
}

/** Kostenzuweisung: „Vollständig“ (Projekt oder Bereich gewählt) oder „Nicht zugewiesen“. */
export type Zuweisung = "vollstaendig" | "keine";
export const ZUWEISUNG_NAMEN: Record<Zuweisung, string> = { vollstaendig: "Vollständig", keine: "Nicht zugewiesen" };
export const ZUWEISUNG_FARBEN: Record<Zuweisung, string> = { vollstaendig: "#3fa66a", keine: "#d99a1c" };

export function istZuweisung(wert: unknown): wert is Zuweisung {
  return wert === "vollstaendig" || wert === "keine";
}

export function zuweisungStatus(z: Pick<EingangZeile, "projectId" | "bereich">): Zuweisung {
  return z.projectId || z.bereich ? "vollstaendig" : "keine";
}

/** „P-(2400)603 – Büros streichen“ bzw. „Lager“ bzw. „–“ */
export function zuweisungText(z: Pick<EingangZeile, "projectId" | "projektText" | "bereich">): string {
  if (z.projectId) return z.projektText || "Projekt";
  if (z.bereich) return BEREICH_NAMEN[z.bereich];
  return "–";
}

/** Fälligkeit wie bei den Ausgangsrechnungen: „8 Tage“, „Heute“, „-1 Tag“; nur bei offenen Rechnungen. */
export function eingangFaelligText(z: Pick<EingangZeile, "faelligAm">, anzeige: EingangAnzeige, heute: string): string {
  if (anzeige === "bezahlt" || !z.faelligAm) return "";
  const tage = tageZwischen(heute, z.faelligAm);
  if (tage === 0) return "Heute";
  return `${tage} ${Math.abs(tage) === 1 ? "Tag" : "Tage"}`;
}

export type EingangFilter = {
  q: string;
  von?: string | null;
  bis?: string | null;
  anzeige: EingangAnzeige[];
  zuweisung: Zuweisung[];
  projektIds: string[];
  nurZuPruefen: boolean;
};

export function eingangFiltern<T extends EingangZeile & { anzeige: EingangAnzeige }>(zeilen: readonly T[], f: EingangFilter): T[] {
  const woerter = suchtext(f.q).toLowerCase().split(" ").filter(Boolean);
  return zeilen.filter((z) => {
    if (f.nurZuPruefen && !z.zuPruefen) return false;
    // Rechnungen ohne Datum zählen beim Zeitraumfilter nicht mit
    if (f.von && (!z.rechnungsdatum || z.rechnungsdatum < f.von)) return false;
    if (f.bis && (!z.rechnungsdatum || z.rechnungsdatum > f.bis)) return false;
    if (f.anzeige.length && !f.anzeige.includes(z.anzeige)) return false;
    if (f.zuweisung.length && !f.zuweisung.includes(zuweisungStatus(z))) return false;
    if (f.projektIds.length && !(z.projectId && f.projektIds.includes(z.projectId))) return false;
    if (woerter.length) {
      const heu = [z.lieferant, z.rechnungsnummer, z.projektText, z.dateiname, z.bereich ? BEREICH_NAMEN[z.bereich] : ""].join(" ").toLowerCase();
      if (!woerter.every((w) => heu.includes(w))) return false;
    }
    return true;
  });
}

// --- Eingabe (Detailseite) ---

const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein gültiges Datum angeben.");

/** Betrag aus dem Eingabefeld (deutsch, „1.234,56“); leer = nicht angegeben. */
function betragFeld(name: string) {
  return z
    .string()
    .trim()
    .transform((t, ctx) => {
      if (t === "") return null;
      const n = einzelpreisLesen(t);
      if (n === null || Math.abs(n) > 9_999_999.99) {
        ctx.addIssue({ code: "custom", message: `${name}: Bitte einen Betrag wie 1.234,56 eingeben.` });
        return z.NEVER;
      }
      return n;
    });
}

export const eingangsrechnungSchema = z
  .object({
    lieferant: z.string().trim().max(200, "Der Lieferant ist zu lang."),
    rechnungsnummer: z.string().trim().max(100, "Die Rechnungsnummer ist zu lang."),
    rechnungsdatum: tag.nullable(),
    faelligAm: tag.nullable(),
    netto: betragFeld("Netto"),
    brutto: betragFeld("Brutto"),
    iban: z.string().trim().max(40, "Die IBAN ist zu lang.").transform((s) => s.replace(/\s+/g, "").toUpperCase()),
    zahlstatus: z.enum(["offen", "bezahlt"]),
    bezahltAm: tag.nullable(),
    projectId: z.uuid().nullable(),
    bereich: z.enum(["lager", "buero", "mitarbeiter"]).nullable(),
    notiz: z.string().trim().max(2000, "Die Notiz ist zu lang (höchstens 2.000 Zeichen)."),
  })
  .refine((d) => !(d.projectId && d.bereich), { message: "Entweder ein Projekt oder ein Bereich, nicht beides.", path: ["bereich"] })
  .refine((d) => d.netto === null || d.brutto === null || Math.abs(d.netto) <= Math.abs(d.brutto) + 0.005, {
    message: "Der Nettobetrag darf nicht größer als der Bruttobetrag sein.",
    path: ["netto"],
  });

export type EingangsrechnungEingabe = z.input<typeof eingangsrechnungSchema>;
export type EingangsrechnungDaten = z.output<typeof eingangsrechnungSchema>;

/** Name der Datei im Speicher: <id>.<endung> */
export function eingangPfad(id: string, endung: string): string {
  return `${id}.${endung}`;
}

export const EINGANG_ENDUNGEN: Record<string, string> = {
  pdf: "application/pdf",
  xml: "application/xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
export const EINGANG_ACCEPT = Object.keys(EINGANG_ENDUNGEN).map((e) => `.${e}`).join(",");
export const EINGANG_MAX_BYTES = 20 * 1024 * 1024;

export function eingangDateiPruefen(name: string, groesse: number): { ok: true; endung: string; typ: string } | { ok: false; fehler: string } {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  const endung = m ? m[1].toLowerCase() : "";
  const typ = EINGANG_ENDUNGEN[endung];
  if (!typ) return { ok: false, fehler: `„${name}“: Erlaubt sind PDF, XML (E-Rechnung), JPG und PNG.` };
  if (groesse <= 0) return { ok: false, fehler: `„${name}“ ist leer.` };
  if (groesse > EINGANG_MAX_BYTES) return { ok: false, fehler: `„${name}“ ist zu groß (höchstens 20 MB).` };
  return { ok: true, endung: endung === "jpeg" ? "jpg" : endung, typ };
}
