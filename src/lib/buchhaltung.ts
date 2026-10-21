import "server-only";
import { erzeugeSevdeskClient, type SevdeskClient } from "@/lib/sevdesk-client";
import { lexwareEingerichtet } from "@/lib/lexware";

/**
 * Welche Buchhaltung arbeitet im Hintergrund? sevdesk oder Lexware Office. Die Zugangsdaten stehen NUR in Umgebungsvariablen
 * (lokal .env.local, online Vercel), nie im Code und nie in der Datenbank.
 *
 *  - BUCHHALTUNG_ANBIETER=sevdesk | lexware (optional; sonst: Lexware, wenn LEXWARE_API_KEY da ist, sonst sevdesk als Reserve, wenn SEVDESK_API_TOKEN da ist)
 *  - SEVDESK_API_TOKEN (32 Zeichen, in sevdesk unter Einstellungen → Benutzer → API-Token)
 *  - SEVDESK_MODUS=entwurf (nur Entwürfe in sevdesk anlegen, nichts versenden/festschreiben: zum gefahrlosen Ausprobieren)
 *  - SEVDESK_BASIS_URL (nur Entwicklung, wird online ignoriert: Schein-Server für Tests)
 */
export type Anbieter = "sevdesk" | "lexware";

export function sevdeskEingerichtet(): boolean {
  return Boolean(process.env.SEVDESK_API_TOKEN?.trim());
}

export function sevdeskClient(): SevdeskClient | null {
  const token = process.env.SEVDESK_API_TOKEN?.trim();
  // Nur in der Entwicklung (nie online) darf SEVDESK_BASIS_URL auf einen Schein-Server zeigen, damit der Token nie an eine fremde Adresse geht.
  const basis = process.env.NODE_ENV !== "production" ? process.env.SEVDESK_BASIS_URL?.trim() || undefined : undefined;
  return token ? erzeugeSevdeskClient({ token, basis }) : null;
}

/** Wird in sevdesk sofort versendet/festgeschrieben (Rechnungsnummer, nicht rücknehmbar)? Standard: ja. SEVDESK_MODUS=entwurf legt nur Entwürfe an. */
export function sevdeskFinalisieren(): boolean {
  return process.env.SEVDESK_MODUS?.trim().toLowerCase() !== "entwurf";
}

/** Anbieter für NEUE Übertragungen. Bereits übertragene Rechnungen bleiben bei ihrem Anbieter (`invoices.anbieter`). */
export function aktuellerAnbieter(): Anbieter | null {
  const wunsch = process.env.BUCHHALTUNG_ANBIETER?.trim().toLowerCase();
  if (wunsch === "sevdesk") return sevdeskEingerichtet() ? "sevdesk" : null;
  if (wunsch === "lexware") return lexwareEingerichtet() ? "lexware" : null;
  // Standard seit 21.10.2026: Lexware (Mika bleibt dort); sevdesk bleibt als Reserve im Code und nur mit ausdrücklichem Wunsch aktiv
  if (lexwareEingerichtet()) return "lexware";
  if (sevdeskEingerichtet()) return "sevdesk";
  return null;
}

/** Name für Meldungen und Knöpfe, auch wenn nichts eingerichtet ist (dann der Wunsch, sonst Lexware). */
export function anbieterName(anbieter: Anbieter | null): string {
  if (anbieter) return anbieter === "sevdesk" ? "sevdesk" : "Lexware";
  return process.env.BUCHHALTUNG_ANBIETER?.trim().toLowerCase() === "sevdesk" ? "sevdesk" : "Lexware";
}
