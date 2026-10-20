// API-Schlüssel für Programme wie „Jarvis“: erzeugen, hashen, aus der Anfrage lesen, Rechte prüfen. Reine Logik ohne Datenbank.
// Aufbau: „mbk_“ + 48 Hex-Zeichen (192 Bit Zufall). Gespeichert wird nur der SHA-256-Hash, der Klartext wird einmal angezeigt.

import { createHash, randomBytes } from "node:crypto";

export type ApiScope = "lesen" | "schreiben";
export const API_SCOPES: ApiScope[] = ["lesen", "schreiben"];
export const API_SCOPE_NAMEN: Record<ApiScope, string> = {
  lesen: "Lesen (Projekte, Kontakte, Zeiten, Angebote, Rechnungen …)",
  schreiben: "Schreiben (Zeiten, Notizen, Container, Entwürfe anlegen; nichts versenden, nichts löschen)",
};

const FORMAT = /^mbk_[0-9a-f]{48}$/;

export function istSchluesselFormat(wert: string): boolean {
  return FORMAT.test(wert);
}

export function hashVon(klartext: string): string {
  return createHash("sha256").update(klartext).digest("hex");
}

export function schluesselErzeugen(): { klartext: string; hash: string; prefix: string } {
  const klartext = `mbk_${randomBytes(24).toString("hex")}`;
  return { klartext, hash: hashVon(klartext), prefix: klartext.slice(0, 8) };
}

/** Schlüssel aus „Authorization: Bearer …“ oder „X-API-Key: …“ holen; leer, wenn keiner da ist. */
export function schluesselAusAnfrage(kopfzeilen: { get(name: string): string | null }): string {
  const auth = kopfzeilen.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) return m[1];
  return kopfzeilen.get("x-api-key")?.trim() ?? "";
}

export function darf(scopes: readonly string[], benoetigt: ApiScope): boolean {
  // „schreiben“ schließt „lesen“ nicht automatisch ein: Rechte werden ausdrücklich vergeben
  return scopes.includes(benoetigt);
}

export function istScope(wert: unknown): wert is ApiScope {
  return wert === "lesen" || wert === "schreiben";
}

/** Anfang des Schlüssels plus Punkte für die Anzeige in der Liste. */
export function schluesselAnzeige(prefix: string): string {
  return `${prefix}…`;
}
