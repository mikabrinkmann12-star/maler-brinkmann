// Rechnungen: Entwurf aus dem Angebot, Rechnen und die Umsetzung für die Lexware-Office-Schnittstelle (auch im Browser nutzbar).
// HARTE REGEL: Rechnungsnummer und Rechnungs-PDF vergibt/erzeugt nur Lexware, nie diese App.

import { angebotBerechnen, type Baustein, type Berechnung } from "@/lib/angebot";

export type RechnungStatus = "entwurf" | "wird_uebertragen" | "uebertragen";

export const RECHNUNG_STATUS_NAMEN: Record<RechnungStatus, string> = {
  entwurf: "Entwurf",
  wird_uebertragen: "Wird übertragen …",
  uebertragen: "An Lexware übertragen",
};

/** Baustein einer Rechnung (Position oder Text). Beträge in Euro, netto. */
export type RechnungsBaustein = {
  typ: "position" | "text";
  kurztext: string;
  langtext: string;
  menge: number | null;
  einheit: string;
  einzelpreis: number | null;
};

/** Aus den Bausteinen eines Angebots werden Rechnungsbausteine: Positionen bleiben, Titel und Text werden Textzeilen, Zwischensummen und Bilder entfallen. */
export function bausteineAusAngebot(bausteine: Baustein[]): RechnungsBaustein[] {
  const aus: RechnungsBaustein[] = [];
  for (const b of bausteine) {
    if (b.typ === "position") {
      aus.push({ typ: "position", kurztext: b.kurztext, langtext: b.langtext, menge: b.menge, einheit: b.einheit, einzelpreis: b.einzelpreis });
    } else if (b.typ === "titel") {
      aus.push({ typ: "text", kurztext: b.kurztext, langtext: "", menge: null, einheit: "", einzelpreis: null });
    } else if (b.typ === "text") {
      aus.push({ typ: "text", kurztext: "", langtext: b.langtext, menge: null, einheit: "", einzelpreis: null });
    }
  }
  return aus;
}

/** Summen der Rechnung (gleiche Regeln wie beim Angebot). */
export function rechnungBerechnen(
  bausteine: RechnungsBaustein[],
  optionen: { rabattProzent: number; steuersatz: number; reverseCharge: boolean },
): Berechnung {
  const alsBaustein: Baustein[] = bausteine.map((b, i) => ({
    id: String(i), typ: b.typ, kurztext: b.kurztext, langtext: b.langtext, menge: b.menge, einheit: b.einheit, einzelpreis: b.einzelpreis, bildPfad: null,
  }));
  return angebotBerechnen(alsBaustein, optionen);
}

/** „Zahlbar innerhalb von 14 Tagen netto“ bzw. mit Skonto. */
export function zahlungsbedingungText(tage: number, skontoProzent: number | null, skontoTage: number | null): string {
  const netto = tage === 0 ? "Zahlbar sofort netto" : `Zahlbar innerhalb von ${tage} Tagen netto`;
  if (skontoProzent && skontoTage) {
    const prozent = String(skontoProzent).replace(".", ",");
    return `Bei Zahlung innerhalb von ${skontoTage} Tagen ${prozent} % Skonto, ${netto.charAt(0).toLowerCase()}${netto.slice(1)}`;
  }
  return netto;
}

// ---------------------------------------------------------------------------
// Lexware Office: Anfrage-Inhalte
// ---------------------------------------------------------------------------

export type RechnungDaten = {
  betreff: string;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string;
  zahlungszielTage: number;
  skontoProzent: number | null;
  skontoTage: number | null;
  steuersatz: number;
  reverseCharge: boolean;
  rabattProzent: number;
  einleitung: string;
  schlusstext: string;
  /** Leitweg-ID des Kunden (nur Behörden): macht die Rechnung zur XRechnung */
  leitwegId?: string;
};

/** „2026-10-18“ → „2026-10-18T00:00:00.000+02:00“ (Mitternacht in deutscher Zeit, Sommer-/Winterzeit beachtet). */
export function lexwareDatum(datum: string): string {
  // Mitternacht in Berlin liegt 1 bis 2 Stunden vor 0 Uhr UTC. Drei Stunden früher ist garantiert vor jeder Umstellung (die um 1 Uhr UTC passiert).
  const kurzVorMitternacht = new Date(Date.parse(`${datum}T00:00:00Z`) - 3 * 3_600_000);
  const teil = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(kurzVorMitternacht)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  const offset = teil === "GMT" ? "+00:00" : teil.replace("GMT", "");
  return `${datum}T00:00:00.000${offset}`;
}

const kuerzen = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Name (höchstens 255 Zeichen) und Beschreibung (höchstens 2.000) einer Zeile; ohne Kurztext dient der erste Satz des Langtexts als Name. */
export function lexwareNameUndBeschreibung(b: { kurztext: string; langtext: string }): { name: string; description?: string } {
  const kurz = b.kurztext.trim();
  const lang = b.langtext.trim();
  if (kurz) return { name: kuerzen(kurz, 255), description: lang ? kuerzen(lang, 2000) : undefined };
  const zeilen = lang.split("\n");
  const name = kuerzen((zeilen[0] ?? "").trim() || "Position", 255);
  const rest = zeilen.slice(1).join("\n").trim();
  return { name, description: rest ? kuerzen(rest, 2000) : undefined };
}

type Zeile =
  | { type: "custom"; name: string; description?: string; quantity: number; unitName: string; unitPrice: { currency: "EUR"; netAmount: number; taxRatePercentage: number } }
  | { type: "text"; name: string; description?: string };

export type LexwareRechnungPayload = {
  voucherDate: string;
  address: { contactId: string };
  lineItems: Zeile[];
  totalPrice: { currency: "EUR" };
  taxConditions: { taxType: "net" | "constructionService13b" };
  paymentConditions: {
    paymentTermLabel: string;
    paymentTermDuration: number;
    paymentDiscountConditions?: { discountPercentage: number; discountRange: number };
  };
  shippingConditions: { shippingType: "service" | "serviceperiod"; shippingDate: string; shippingEndDate?: string };
  title: string;
  introduction?: string;
  remark?: string;
  /** Nur bei Behörden: Leitweg-ID, Lexware erzeugt dann eine XRechnung */
  xRechnung?: { buyerReference: string };
};

/**
 * Inhalt für `POST /v1/invoices`. Der Rabatt wird als Zeile mit negativem Betrag übergeben (rechnet auf den Cent genau wie die App).
 * Bei Reverse-Charge (§ 13b UStG) ist `taxType` `constructionService13b` und der Steuersatz 0.
 */
export function lexwareRechnungPayload(r: RechnungDaten, bausteine: RechnungsBaustein[], lexwareKontaktId: string): LexwareRechnungPayload {
  const satz = r.reverseCharge ? 0 : r.steuersatz;
  const zeilen: Zeile[] = [];
  for (const b of bausteine) {
    const { name, description } = lexwareNameUndBeschreibung(b);
    if (b.typ === "text") {
      zeilen.push({ type: "text", name, ...(description ? { description } : {}) });
    } else {
      zeilen.push({
        type: "custom",
        name,
        ...(description ? { description } : {}),
        quantity: b.menge ?? 0,
        unitName: b.einheit.trim() || "Stk",
        unitPrice: { currency: "EUR", netAmount: b.einzelpreis ?? 0, taxRatePercentage: satz },
      });
    }
  }
  const rechnung = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
  if (rechnung.rabatt > 0) {
    zeilen.push({
      type: "custom",
      name: `Rabatt ${String(r.rabattProzent).replace(".", ",")} %`,
      quantity: 1,
      unitName: "psch",
      unitPrice: { currency: "EUR", netAmount: -rechnung.rabatt, taxRatePercentage: satz },
    });
  }

  const einzeltag = r.leistungVon === r.leistungBis;
  return {
    voucherDate: lexwareDatum(r.rechnungsdatum),
    address: { contactId: lexwareKontaktId },
    lineItems: zeilen,
    totalPrice: { currency: "EUR" },
    taxConditions: { taxType: r.reverseCharge ? "constructionService13b" : "net" },
    paymentConditions: {
      paymentTermLabel: kuerzen(zahlungsbedingungText(r.zahlungszielTage, r.skontoProzent, r.skontoTage), 255),
      paymentTermDuration: r.zahlungszielTage,
      ...(r.skontoProzent && r.skontoTage
        ? { paymentDiscountConditions: { discountPercentage: r.skontoProzent, discountRange: r.skontoTage } }
        : {}),
    },
    shippingConditions: einzeltag
      ? { shippingType: "service", shippingDate: lexwareDatum(r.leistungVon) }
      : { shippingType: "serviceperiod", shippingDate: lexwareDatum(r.leistungVon), shippingEndDate: lexwareDatum(r.leistungBis) },
    title: kuerzen(r.betreff, 100),
    ...(r.einleitung.trim() ? { introduction: r.einleitung.trim() } : {}),
    ...(r.schlusstext.trim() ? { remark: r.schlusstext.trim() } : {}),
    ...(r.leitwegId?.trim() ? { xRechnung: { buyerReference: r.leitwegId.trim() } } : {}),
  };
}

export type KontaktFuerLexware = {
  typ: string;
  anrede: string | null;
  firmenname: string | null;
  ansprechpartner: string | null;
  vorname: string | null;
  nachname: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  email: string | null;
  leitweg_id?: string | null;
};

/** Inhalt für `POST /v1/contacts`: Kunde als Firma oder Privatperson mit Rechnungsadresse. */
export function lexwareKontaktPayload(k: KontaktFuerLexware): Record<string, unknown> {
  const adresse = k.strasse || k.plz || k.ort
    ? { addresses: { billing: [{ ...(k.strasse ? { street: k.strasse } : {}), ...(k.plz ? { zip: k.plz } : {}), ...(k.ort ? { city: k.ort } : {}), countryCode: "DE" }] } }
    : {};
  const mail = k.email ? { emailAddresses: { business: [k.email] } } : {};
  const istFirma = k.typ === "firma" && k.firmenname?.trim();
  const xr = k.leitweg_id?.trim() ? { xRechnung: { buyerReference: k.leitweg_id.trim() } } : {};
  const basis = { version: 0, roles: { customer: {} }, ...adresse, ...mail, ...xr };
  if (istFirma) {
    const teile = (k.ansprechpartner ?? "").trim().split(/\s+/).filter(Boolean);
    const person = teile.length
      ? { contactPersons: [{ ...(teile.length > 1 ? { firstName: teile.slice(0, -1).join(" ") } : {}), lastName: teile[teile.length - 1], primary: true }] }
      : {};
    return { ...basis, company: { name: kuerzen(k.firmenname!.trim(), 100), ...person } };
  }
  return {
    ...basis,
    person: {
      ...(k.anrede?.trim() ? { salutation: k.anrede.trim() } : {}),
      ...(k.vorname?.trim() ? { firstName: k.vorname.trim() } : {}),
      lastName: (k.nachname?.trim() || k.firmenname?.trim() || "Unbekannt"),
    },
  };
}

export type LexwareRechnungInfo = {
  rechnungsnummer: string;
  status: string;
  netto: number | null;
  brutto: number | null;
};

/** Wichtiges aus der Lexware-Antwort `GET /v1/invoices/{id}` lesen (fehlende Felder bleiben leer). */
export function rechnungInfoAusLexware(antwort: unknown): LexwareRechnungInfo {
  const a = typeof antwort === "object" && antwort !== null ? (antwort as Record<string, unknown>) : {};
  const preis = typeof a.totalPrice === "object" && a.totalPrice !== null ? (a.totalPrice as Record<string, unknown>) : {};
  const zahl = (w: unknown) => (typeof w === "number" && Number.isFinite(w) ? w : null);
  return {
    rechnungsnummer: typeof a.voucherNumber === "string" ? a.voucherNumber : "",
    status: typeof a.voucherStatus === "string" ? a.voucherStatus : "",
    netto: zahl(preis.totalNetAmount),
    brutto: zahl(preis.totalGrossAmount),
  };
}

/** Link zur Rechnung in der Lexware-Oberfläche. */
export function lexwareLink(lexwareId: string): string {
  return `https://app.lexware.de/permalink/invoices/view/${lexwareId}`;
}
