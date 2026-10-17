"use server";

import { revalidatePath } from "next/cache";
import nodemailer from "nodemailer";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { betreffBereinigen, mailSchema } from "@/lib/angebot-mail";
import { angebotPdfErzeugen } from "@/lib/angebot-pdf-daten";
import { smtpKonfiguration } from "@/lib/env";
import { firmaLaden } from "@/lib/firma-daten";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

export type MailErgebnis = { fehler?: string; gesendetAn?: string };

/** Fehler des Mail-Servers in eine verständliche Meldung übersetzen (ohne Zugangsdaten oder Serverdetails zu verraten). */
function mailFehlerText(fehler: unknown): string {
  const code = typeof fehler === "object" && fehler !== null && "code" in fehler ? String((fehler as { code: unknown }).code) : "";
  if (code === "EAUTH") return "Die Anmeldung am Mail-Server ist fehlgeschlagen. Bitte Benutzer und Passwort der SMTP-Zugangsdaten prüfen.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS", "ENOTFOUND"].includes(code)) {
    return "Der Mail-Server ist nicht erreichbar. Bitte SMTP-Server und Port prüfen und später nochmal versuchen.";
  }
  if (code === "EENVELOPE") return "Der Mail-Server hat die Empfänger-Adresse abgelehnt. Bitte die Adresse prüfen.";
  return "Die E-Mail konnte nicht gesendet werden. Bitte nochmal versuchen.";
}

/**
 * Angebot als PDF per E-Mail schicken (Büro und Admin). Ist das Angebot noch ein Entwurf, wird es dafür auf „Versendet“ gesetzt,
 * bevor das PDF entsteht (damit „Entwurf“ nicht darauf steht). Schlägt der Versand fehl, geht der Status zurück auf „Entwurf“.
 * Gesendet wird an genau eine Adresse, die das Büro eintippt oder bestätigt.
 */
export async function angebotMailSenden(angebotId: string, eingabe: unknown): Promise<MailErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!z.uuid().safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const pruefung = mailSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const mail = pruefung.data;

  const smtp = smtpKonfiguration();
  if (!smtp) return { fehler: "Der E-Mail-Versand ist noch nicht eingerichtet (SMTP-Zugangsdaten fehlen)." };

  const supabase = await createClient();
  const { data: q } = await supabase.from("quotes").select("id, status, archiviert_am").eq("id", angebotId).maybeSingle();
  if (!q) return { fehler: "Angebot nicht gefunden." };
  if (q.archiviert_am) return { fehler: "Ein archiviertes Angebot kann nicht verschickt werden." };

  let statusGeaendert = false;
  if (q.status === "entwurf") {
    const { count } = await supabase.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", angebotId).eq("typ", "position");
    if (!count) return { fehler: "Das Angebot hat noch keine Position." };
    const { error } = await supabase.from("quotes").update({ status: "versendet" }).eq("id", angebotId);
    if (error) return { fehler: "Der Status konnte nicht geändert werden. Bitte nochmal versuchen." };
    statusGeaendert = true;
  }

  const zuruecksetzen = async () => {
    if (statusGeaendert) await supabase.from("quotes").update({ status: "entwurf" }).eq("id", angebotId);
  };

  try {
    const pdf = await angebotPdfErzeugen(angebotId);
    if (!pdf) {
      await zuruecksetzen();
      return { fehler: "Angebot nicht gefunden." };
    }
    const firma = await firmaLaden();
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    await transport.sendMail({
      from: smtp.von.includes("<") ? smtp.von : { name: firma.name || smtp.von, address: smtp.von },
      to: mail.an,
      replyTo: firma.email || undefined,
      subject: betreffBereinigen(mail.betreff),
      text: mail.text,
      attachments: [{ filename: pdf.dateiname, content: Buffer.from(pdf.bytes), contentType: "application/pdf" }],
    });
  } catch (fehler) {
    await zuruecksetzen();
    console.error("[mail] Versand fehlgeschlagen:", typeof fehler === "object" && fehler !== null && "code" in fehler ? (fehler as { code: unknown }).code : "unbekannt");
    return { fehler: mailFehlerText(fehler) };
  }

  await supabase.from("quotes").update({ versendet_am: new Date().toISOString(), versendet_an: mail.an }).eq("id", angebotId);
  revalidatePath("/buero/angebote", "layout");
  revalidatePath(`/buero/angebote/${angebotId}`);
  return { gesendetAn: mail.an };
}
