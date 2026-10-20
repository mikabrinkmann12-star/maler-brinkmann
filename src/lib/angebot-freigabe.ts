// Angebot per Link: Schlüssel für den Link, Adresse der Online-Ansicht und die E-Mail im Stil von Plancraft (Logo, Text, grüner Knopf „Ihr Angebot ansehen“).
// Reine Logik ohne Datenbank (auch gut testbar). Der Schlüssel steht nur im Link; gespeichert wird nur sein SHA-256-Hash.

import { randomBytes } from "node:crypto";
import { hashVon } from "@/lib/api-schluessel";

const FORMAT = /^[0-9a-f]{48}$/;

export function linkSchluesselErzeugen(): { klartext: string; hash: string } {
  const klartext = randomBytes(24).toString("hex");
  return { klartext, hash: hashVon(klartext) };
}

export function istLinkSchluessel(wert: string): boolean {
  return FORMAT.test(wert);
}

/** Basisadresse der App für Links in E-Mails: NEXT_PUBLIC_APP_URL, sonst die Produktions-Adresse bei Vercel, sonst lokal. */
export function appBasisUrl(env: Record<string, string | undefined> = process.env): string {
  const gesetzt = env.NEXT_PUBLIC_APP_URL?.trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export function angebotLink(basis: string, schluessel: string): string {
  return `${basis.replace(/\/+$/, "")}/angebot/${schluessel}`;
}

export function htmlMaskieren(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type MailHtmlDaten = {
  /** Text der E-Mail (Anrede, Satz zum Angebot, Gruß); Zeilenumbrüche bleiben erhalten */
  text: string;
  link: string;
  firmenname: string;
  /** Absenderzeile unten: Anschrift, Telefon, Web */
  fusszeile: string[];
  /** Content-ID des Logos, wenn es als Bild in der Mail steckt */
  logoCid?: string;
  knopf?: string;
};

/** HTML der Angebots-Mail: einfache Tabellen mit Inline-Formatierung, damit sie in allen Mail-Programmen gleich aussieht. */
export function angebotMailHtml(d: MailHtmlDaten): string {
  const absaetze = d.text
    .trim()
    .split(/\n{2,}/)
    .map((a) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2933">${htmlMaskieren(a).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const logo = d.logoCid
    ? `<img src="cid:${htmlMaskieren(d.logoCid)}" alt="${htmlMaskieren(d.firmenname)}" style="display:block;max-width:180px;max-height:70px;margin:0 auto 24px;border:0">`
    : `<p style="margin:0 0 24px;text-align:center;font-size:20px;font-weight:700;color:#1f2933">${htmlMaskieren(d.firmenname)}</p>`;
  const fuss = d.fusszeile.filter(Boolean).map((z) => htmlMaskieren(z)).join("<br>");
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlMaskieren(d.firmenname)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f3;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f3;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;border:1px solid #e1e6e3"><tr><td style="padding:32px 32px 28px">
${logo}
${absaetze}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="background:#2d9d5c;border-radius:6px"><a href="${htmlMaskieren(d.link)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${htmlMaskieren(d.knopf ?? "Ihr Angebot ansehen")}</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7680">Funktioniert der Knopf nicht? Kopieren Sie diesen Link in Ihren Browser:<br><a href="${htmlMaskieren(d.link)}" style="color:#6b7680;word-break:break-all">${htmlMaskieren(d.link)}</a></p>
</td></tr></table>
<p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:12px;line-height:1.5;color:#8a949c">${fuss}</p>
</td></tr></table>
</body></html>`;
}

/** Textfassung der Mail (für Programme ohne HTML und als Zusatz). */
export function angebotMailText(text: string, link: string): string {
  return `${text.trim()}\n\nIhr Angebot ansehen: ${link}\n`;
}
