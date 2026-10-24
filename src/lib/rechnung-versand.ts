import "server-only";
import nodemailer from "nodemailer";
import { angebotEinstellungenLaden, firmaLaden } from "@/lib/firma-daten";
import type { Firma } from "@/lib/firma";
import { smtpKonfiguration } from "@/lib/env";
import { mailFehlerText } from "@/lib/mail-fehler";
import { createClient } from "@/lib/supabase/server";

// Versand von Rechnungen und Mahnungen per E-Mail (eigene Rechnungen der App) über das SMTP-Postfach, das auch die Angebote benutzen.
// Wer das aufruft, hat vorher requireBueroRecht("rechnungen") geprüft.

/** Firmendaten und (wenn eingeschaltet) das Logo als Bytes für PDFs. */
export async function firmaMitLogo(): Promise<{ firma: Firma; logo?: Uint8Array }> {
  const [firma, vorgaben] = await Promise.all([firmaLaden(), angebotEinstellungenLaden()]);
  if (!firma.logo || !vorgaben.logo_anzeigen) return { firma };
  const supabase = await createClient();
  const { data } = await supabase.storage.from("firmenlogo").download(firma.logo);
  return { firma, logo: data ? new Uint8Array(await data.arrayBuffer()) : undefined };
}

export type Anhang = { filename: string; content: Uint8Array; contentType: string };

/** Mail an genau eine Adresse mit Anhängen senden. Der Absender steht in SMTP_FROM bzw. ist der SMTP-Benutzer. */
export async function mailSenden(eingabe: { an: string; betreff: string; text: string; anhaenge: Anhang[] }): Promise<{ fehler?: string }> {
  const smtp = smtpKonfiguration();
  if (!smtp) return { fehler: "Der E-Mail-Versand ist noch nicht eingerichtet (SMTP-Zugangsdaten fehlen)." };
  try {
    const firma = await firmaLaden();
    const transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.password } });
    await transport.sendMail({
      from: firma.name ? { name: firma.name, address: smtp.von } : smtp.von,
      to: eingabe.an,
      subject: eingabe.betreff,
      text: eingabe.text,
      attachments: eingabe.anhaenge.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    });
    return {};
  } catch (fehler) {
    return { fehler: mailFehlerText(fehler) };
  }
}
