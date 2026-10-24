// Fehler des Mail-Servers in eine verständliche Meldung übersetzen (ohne Zugangsdaten oder Serverdetails zu verraten). Auch im Browser nutzbar.

export function mailFehlerText(fehler: unknown): string {
  const code = typeof fehler === "object" && fehler !== null && "code" in fehler ? String((fehler as { code: unknown }).code) : "";
  if (code === "EAUTH") return "Die Anmeldung am Mail-Server ist fehlgeschlagen. Bitte Benutzer und Passwort der SMTP-Zugangsdaten prüfen.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS", "ENOTFOUND"].includes(code)) {
    return "Der Mail-Server ist nicht erreichbar. Bitte SMTP-Server und Port prüfen und später nochmal versuchen.";
  }
  if (code === "EENVELOPE") return "Der Mail-Server hat die Empfänger-Adresse abgelehnt. Bitte die Adresse prüfen.";
  return "Die E-Mail konnte nicht gesendet werden. Bitte nochmal versuchen.";
}
