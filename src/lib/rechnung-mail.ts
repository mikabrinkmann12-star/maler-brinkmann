// E-Mail zur Rechnung und zur Mahnung: Vorschläge für Betreff und Text (das Büro ändert sie vor dem Senden) und Prüfung der Eingaben.
// Gesendet wird über die Buchhaltung (sevdesk hängt die Rechnung als PDF bzw. XML an). Auch im Browser nutzbar.

import { z } from "zod";
import { formatBetrag, formatDatum } from "@/lib/format";
import { faelligAm } from "@/lib/dashboard";
import { MAHN_STUFEN_NAMEN, stufeSchluessel, type RechnungsEinstellungen } from "@/lib/rechnung-einstellungen";

const adresse = z.string().trim().max(320, "Die E-Mail-Adresse ist zu lang.").pipe(z.email("Bitte eine gültige E-Mail-Adresse eingeben."));

export const rechnungMailSchema = z.object({
  an: adresse,
  betreff: z.string().trim().min(1, "Bitte einen Betreff eingeben.").max(200, "Der Betreff ist zu lang (höchstens 200 Zeichen)."),
  text: z.string().trim().min(1, "Bitte einen Text eingeben.").max(5000, "Der Text ist zu lang (höchstens 5.000 Zeichen)."),
});
export type RechnungMailEingabe = z.input<typeof rechnungMailSchema>;

export type MailVorschlag = { betreff: string; text: string };

type Angaben = { rechnungsnummer: string; betreff: string; brutto: number | null; rechnungsdatum: string; zahlungszielTage: number | null; firma: string };

function faelligText(a: Angaben): string {
  const f = faelligAm(a.rechnungsdatum, a.zahlungszielTage);
  return f ? formatDatum(f) : "";
}

/** Vorschlag für die Mail mit der Rechnung. */
export function rechnungMailVorschlag(a: Angaben): MailVorschlag {
  const nr = a.rechnungsnummer ? ` ${a.rechnungsnummer}` : "";
  const betrag = a.brutto !== null ? ` über ${formatBetrag(a.brutto)}` : "";
  const faellig = faelligText(a);
  return {
    betreff: `Rechnung${nr}: ${a.betreff}`,
    text: [
      "Sehr geehrte Damen und Herren,",
      `anbei erhalten Sie unsere Rechnung${nr}${betrag} für „${a.betreff}“.${faellig ? ` Bitte überweisen Sie den Betrag bis zum ${faellig}.` : ""}`,
      "Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
      `Mit freundlichen Grüßen\n${a.firma}`,
    ].join("\n\n"),
  };
}

/** Vorschlag für die Mail zu einer Zahlungserinnerung (Stufe 1) bzw. Mahnung (Stufe 2 und 3), mit Frist und Gebühr aus den Einstellungen. */
export function mahnungMailVorschlag(a: Angaben, stufe: number, einstellungen: RechnungsEinstellungen, heute: string): MailVorschlag {
  const schluessel = stufeSchluessel(stufe);
  const name = schluessel ? MAHN_STUFEN_NAMEN[schluessel] : "Mahnung";
  const nr = a.rechnungsnummer ? ` ${a.rechnungsnummer}` : "";
  const vorgabe = schluessel ? einstellungen[schluessel] : null;
  const frist = vorgabe ? new Date(Date.parse(`${heute}T12:00:00Z`) + vorgabe.tage * 86_400_000).toISOString().slice(0, 10) : "";
  const betrag = a.brutto !== null ? ` über ${formatBetrag(a.brutto)}` : "";
  const einleitung =
    stufe === 1
      ? `bei der Durchsicht unserer Buchhaltung ist uns aufgefallen, dass die Rechnung${nr}${betrag} noch offen ist. Vielleicht ist die Zahlung nur übersehen worden.`
      : `leider konnten wir für die Rechnung${nr}${betrag} trotz unserer Erinnerung noch keinen Zahlungseingang feststellen.`;
  const zeilen = [
    "Sehr geehrte Damen und Herren,",
    einleitung,
    `Bitte überweisen Sie den offenen Betrag${frist ? ` bis zum ${formatDatum(frist)}` : " umgehend"}. Falls Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`,
  ];
  if (stufe > 1 && vorgabe && vorgabe.gebuehr > 0) zeilen.push(`Für diese Mahnung berechnen wir eine Gebühr von ${formatBetrag(vorgabe.gebuehr)}.`);
  zeilen.push(`Mit freundlichen Grüßen\n${a.firma}`);
  return { betreff: `${name}: Rechnung${nr}`, text: zeilen.join("\n\n") };
}
