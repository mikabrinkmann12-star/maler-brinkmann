// Aus einer E-Mail die Anhänge herausfiltern, die Eingangsrechnungen sein können (PDF, XML, größere Bilder).
// Reine Logik, ohne Netz: gut testbar.

import { EINGANG_ENDUNGEN, EINGANG_MAX_BYTES } from "@/lib/eingangsrechnung";

export type MailAnhang = {
  filename?: string;
  contentType?: string;
  size?: number;
  content: Uint8Array;
  /** „inline“ = Teil des Mail-Textes (Logo, Signatur) */
  contentDisposition?: string;
  related?: boolean;
};

export type RechnungsAnhang = { dateiname: string; endung: string; typ: string; bytes: Uint8Array };

/** Bilder unter dieser Größe sind meist Logos oder Signaturen, keine Rechnungen. */
export const BILD_MINDESTGROESSE = 30 * 1024;

function endungAus(name: string, typ: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  const e = m ? m[1].toLowerCase() : "";
  if (e in EINGANG_ENDUNGEN) return e === "jpeg" ? "jpg" : e;
  const t = typ.toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (t === "application/xml" || t === "text/xml") return "xml";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/png") return "png";
  return "";
}

export function anhaengeAuswaehlen(anhaenge: MailAnhang[]): RechnungsAnhang[] {
  const ergebnis: RechnungsAnhang[] = [];
  for (const a of anhaenge) {
    const name = (a.filename ?? "").trim();
    const endung = endungAus(name, a.contentType ?? "");
    if (!endung) continue;
    const bytes = a.content;
    if (bytes.length === 0 || bytes.length > EINGANG_MAX_BYTES) continue;
    const istBild = endung === "jpg" || endung === "png";
    if (istBild && (a.related || a.contentDisposition === "inline" || bytes.length < BILD_MINDESTGROESSE)) continue;
    ergebnis.push({
      dateiname: name || `Anhang.${endung}`,
      endung,
      typ: EINGANG_ENDUNGEN[endung],
      bytes,
    });
  }
  return ergebnis;
}
