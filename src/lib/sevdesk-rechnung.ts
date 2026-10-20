// Rechnungen für sevdesk: Anfrage-Inhalte (Kunde, Rechnung mit Positionen), Umrechnung der Antworten (auch im Browser nutzbar).
// HARTE REGEL: Rechnungsnummer und Rechnungs-PDF vergibt/erzeugt nur sevdesk, nie diese App.
// Gebaut nach der OpenAPI-Beschreibung von sevdesk (Update 2.0, Steuerregeln `taxRule`); noch nicht mit einem echten Konto geprüft.

import { einheitSchluessel } from "@/lib/sevdesk-einheit";
import { rechnungBerechnen, zahlungsbedingungText, type KontaktFuerLexware, type RechnungDaten, type RechnungsBaustein } from "@/lib/rechnung";

export type SevdeskKontaktEingabe = {
  /** Firmenname (dann legt sevdesk eine Organisation an), sonst Person */
  firma: string;
  vorname: string;
  nachname: string;
  ansprechpartner: string;
  strasse: string;
  plz: string;
  ort: string;
  email: string;
  kundennummer: string;
  leitwegId: string;
};

export function sevdeskKontaktEingabe(k: KontaktFuerLexware & { kundennummer?: string | null }): SevdeskKontaktEingabe {
  const istFirma = k.typ === "firma" && Boolean(k.firmenname?.trim());
  return {
    firma: istFirma ? k.firmenname!.trim() : "",
    vorname: istFirma ? "" : (k.vorname ?? "").trim(),
    nachname: istFirma ? "" : (k.nachname?.trim() || k.firmenname?.trim() || ""),
    ansprechpartner: (k.ansprechpartner ?? "").trim(),
    strasse: (k.strasse ?? "").trim(),
    plz: (k.plz ?? "").trim(),
    ort: (k.ort ?? "").trim(),
    email: (k.email ?? "").trim(),
    kundennummer: (k.kundennummer ?? "").trim(),
    leitwegId: (k.leitweg_id ?? "").trim(),
  };
}

/** „2026-10-20“ → „20.10.2026“ (so schreibt sevdesk Datumsangaben in seiner Beschreibung). */
export function sevdeskDatum(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/** „20.10.2026“ oder „2026-10-20…“ oder Unix-Sekunden → ISO-Datum; unlesbar → leer. */
export function sevdeskDatumLesen(wert: unknown): string {
  if (typeof wert === "number" && Number.isFinite(wert)) return new Date(wert * 1000).toISOString().slice(0, 10);
  if (typeof wert !== "string") return "";
  const t = wert.trim();
  const de = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(t);
  if (de) return `${de[3]}-${de[2]}-${de[1]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return iso ? iso[1] : "";
}

const kuerzen = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const html = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

type Ref = { id: number; objectName: string };

export type SevdeskPosition = {
  objectName: "InvoicePos";
  mapAll: true;
  positionNumber: number;
  name: string;
  text?: string;
  quantity: number;
  price: number;
  taxRate: number;
  unity: Ref;
};

export type SevdeskRechnungKoerper = {
  invoice: Record<string, unknown>;
  invoicePosSave: SevdeskPosition[];
  invoicePosDelete: null;
  discountSave: null;
  discountDelete: null;
  takeDefaultAddress: true;
};

export type SevdeskKontext = {
  kontaktId: string;
  benutzerId: string;
  /** Einheiten des Kontos (siehe `einheiten()` im Client): Schlüssel → ID */
  einheiten: Map<string, number>;
};

const EINHEIT_SYNONYME: Record<string, string[]> = {
  stk: ["stk", "stück", "stueck", "piece", "c62"],
  std: ["std", "stunde", "stunden", "h", "hur"],
  psch: ["psch", "pauschal", "pauschale", "pausch"],
  m2: ["m2", "qm", "quadratmeter", "mtk"],
  m: ["m", "meter", "lfm", "mtr"],
  m3: ["m3", "kubikmeter", "mtq"],
  kg: ["kg", "kilogramm", "kgm"],
  liter: ["liter", "l", "ltr"],
  min: ["min", "minute", "minuten", "mon"],
};

/** ID der passenden sevdesk-Einheit; unbekannte Einheiten bekommen „Stück“ (der Name der Einheit steht dann in der Positionsbeschreibung). */
export function sevdeskEinheit(einheit: string, karte: Map<string, number>): { ref: Ref; passend: boolean } {
  const s = einheitSchluessel(einheit || "stk");
  const direkt = karte.get(s);
  if (direkt) return { ref: { id: direkt, objectName: "Unity" }, passend: true };
  for (const namen of Object.values(EINHEIT_SYNONYME)) {
    if (!namen.includes(s)) continue;
    for (const n of namen) {
      const id = karte.get(n);
      if (id) return { ref: { id, objectName: "Unity" }, passend: true };
    }
  }
  const stueck = EINHEIT_SYNONYME.stk.map((n) => karte.get(n)).find(Boolean);
  return { ref: { id: stueck ?? 1, objectName: "Unity" }, passend: false };
}

/**
 * Inhalt für `POST /Invoice/Factory/saveInvoice` (Entwurf). Textzeilen (Titel, Text) gibt es in sevdesk nicht als eigene Zeile:
 * Sie stehen als Beschreibung vor der nächsten Position, übrige am Ende der Schlusstexte. Der Rabatt ist eine Zeile mit negativem
 * Betrag (rechnet auf den Cent genau wie die App). Reverse-Charge (§ 13b UStG) ist die Steuerregel 5 mit Steuersatz 0.
 */
export function sevdeskRechnungKoerper(r: RechnungDaten, bausteine: RechnungsBaustein[], ctx: SevdeskKontext): SevdeskRechnungKoerper {
  const satz = r.reverseCharge ? 0 : r.steuersatz;
  const positionen: SevdeskPosition[] = [];
  let vorText: string[] = [];

  for (const b of bausteine) {
    const kurz = b.kurztext.trim();
    const lang = b.langtext.trim();
    if (b.typ === "text") {
      const zeile = [kurz, lang].filter(Boolean).join("\n");
      if (zeile) vorText.push(zeile);
      continue;
    }
    const { ref, passend } = sevdeskEinheit(b.einheit, ctx.einheiten);
    const name = kurz || lang.split("\n")[0] || "Position";
    const rest = kurz ? lang : lang.split("\n").slice(1).join("\n").trim();
    const text = [...vorText, rest, passend || !b.einheit.trim() ? "" : `Einheit: ${b.einheit.trim()}`].filter(Boolean).join("\n");
    vorText = [];
    positionen.push({
      objectName: "InvoicePos",
      mapAll: true,
      positionNumber: positionen.length,
      name: kuerzen(name, 255),
      ...(text ? { text: kuerzen(text, 5000) } : {}),
      quantity: b.menge ?? 0,
      price: b.einzelpreis ?? 0,
      taxRate: satz,
      unity: ref,
    });
  }

  const rechnung = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
  if (rechnung.rabatt > 0) {
    positionen.push({
      objectName: "InvoicePos",
      mapAll: true,
      positionNumber: positionen.length,
      name: `Rabatt ${String(r.rabattProzent).replace(".", ",")} %`,
      quantity: 1,
      price: -rechnung.rabatt,
      taxRate: satz,
      unity: sevdeskEinheit("psch", ctx.einheiten).ref,
    });
  }

  const einzeltag = r.leistungVon === r.leistungBis;
  const fussTeile = [r.schlusstext.trim(), ...vorText].filter(Boolean);
  const steuerText = r.reverseCharge ? "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)" : satz === 0 ? "Umsatzsteuer 0%" : `Umsatzsteuer ${String(satz).replace(".", ",")}%`;
  const bedingung = zahlungsbedingungText(r.zahlungszielTage, r.skontoProzent, r.skontoTage);

  const invoice: Record<string, unknown> = {
    objectName: "Invoice",
    mapAll: true,
    invoiceType: "RE",
    status: 100,
    currency: "EUR",
    invoiceDate: sevdeskDatum(r.rechnungsdatum),
    deliveryDate: sevdeskDatum(r.leistungVon),
    ...(einzeltag ? {} : { deliveryDateUntil: Math.floor(Date.parse(`${r.leistungBis}T12:00:00Z`) / 1000) }),
    contact: { id: Number(ctx.kontaktId), objectName: "Contact" },
    contactPerson: { id: Number(ctx.benutzerId), objectName: "SevUser" },
    addressCountry: { id: 1, objectName: "StaticCountry" },
    taxRule: { id: r.reverseCharge ? "5" : "1", objectName: "TaxRule" },
    taxText: steuerText,
    taxRate: satz,
    showNet: true,
    header: kuerzen(r.betreff, 200),
    ...(r.einleitung.trim() ? { headText: html(r.einleitung.trim()) } : {}),
    footText: html([...fussTeile, bedingung].join("\n\n")),
    timeToPay: r.zahlungszielTage,
    discount: r.skontoProzent ?? 0,
    ...(r.skontoProzent && r.skontoTage ? { discountTime: r.skontoTage } : {}),
    ...(r.leitwegId?.trim() ? { propertyIsEInvoice: true, customerInternalNote: r.leitwegId.trim() } : {}),
  };

  return { invoice, invoicePosSave: positionen, invoicePosDelete: null, discountSave: null, discountDelete: null, takeDefaultAddress: true };
}

/** Status in sevdesk (100 Entwurf, 200 offen, 750 teilweise bezahlt, 1000 bezahlt) → der Status, den die App speichert (wie bei Lexware: draft/open/paid). */
export function statusAusSevdesk(roh: unknown): string {
  const s = String(roh ?? "");
  if (s === "1000") return "paid";
  if (s === "200" || s === "750") return "open";
  if (s === "100" || s === "50") return "draft";
  return "";
}

export type SevdeskRechnungInfo = {
  rechnungsnummer: string;
  /** draft / open / paid (leer, wenn sevdesk etwas Unbekanntes meldet) */
  status: string;
  rohStatus: string;
  netto: number | null;
  brutto: number | null;
  /** Schon etwas gezahlt, aber noch nicht alles (Status 750) */
  teilbezahlt: boolean;
  /** Festgeschrieben (GoBD) */
  festgeschrieben: boolean;
};

/** Wichtiges aus der sevdesk-Antwort `GET /Invoice/{id}` lesen (Beträge kommen als Text, fehlende Felder bleiben leer). */
export function rechnungInfoAusSevdesk(antwort: unknown): SevdeskRechnungInfo {
  const a = typeof antwort === "object" && antwort !== null ? (antwort as Record<string, unknown>) : {};
  const zahl = (w: unknown) => {
    const n = typeof w === "number" ? w : typeof w === "string" && w.trim() !== "" ? Number(w) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const roh = String(a.status ?? "");
  return {
    rechnungsnummer: typeof a.invoiceNumber === "string" ? a.invoiceNumber : "",
    status: statusAusSevdesk(roh),
    rohStatus: roh,
    netto: zahl(a.sumNet),
    brutto: zahl(a.sumGross),
    teilbezahlt: roh === "750",
    festgeschrieben: typeof a.enshrined === "string" ? a.enshrined.length > 0 : false,
  };
}
