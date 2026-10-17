import "server-only";
import { erzeugeLexwareClient, type LexwareClient } from "@/lib/lexware-client";

/**
 * Verbindung zu Lexware Office (nur serverseitig). Der API-Schlüssel steht NUR in der Umgebungsvariable LEXWARE_API_KEY
 * (lokal .env.local, online Vercel), nie im Code und nie in der Datenbank. Fehlt er, ist Lexware „nicht eingerichtet“.
 */
export function lexwareEingerichtet(): boolean {
  return Boolean(process.env.LEXWARE_API_KEY?.trim());
}

export function lexwareClient(): LexwareClient | null {
  const apiKey = process.env.LEXWARE_API_KEY?.trim();
  // Nur in der Entwicklung (nie online) darf LEXWARE_BASIS_URL auf einen Schein-Server zeigen, damit der Schlüssel nie an eine fremde Adresse geht.
  const basis = process.env.NODE_ENV !== "production" ? process.env.LEXWARE_BASIS_URL?.trim() || undefined : undefined;
  return apiKey ? erzeugeLexwareClient({ apiKey, basis }) : null;
}

/**
 * Wird die Rechnung in Lexware sofort finalisiert (Nummer + PDF, nicht rücknehmbar)? Standard: ja.
 * Mit LEXWARE_MODUS=entwurf legt die App sie nur als Entwurf in Lexware an. Zum gefahrlosen Ausprobieren mit dem echten Konto.
 */
export function lexwareFinalisieren(): boolean {
  return process.env.LEXWARE_MODUS?.trim().toLowerCase() !== "entwurf";
}
