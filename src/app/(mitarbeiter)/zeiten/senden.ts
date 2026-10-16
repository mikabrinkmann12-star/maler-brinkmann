import {
  auftragEntfernen,
  auftragFehlerMerken,
  auftragMerken,
  type Auftrag,
} from "@/lib/warteschlange";
import { zeitAendern, zeitArchivieren, zeitenAnlegen, type ZeitErgebnis } from "./actions";

// Verbindet die Warteschlange (src/lib/warteschlange.ts) mit den Server-Aktionen.

type Nutzlast = { id?: unknown; daten?: unknown };

const AKTIONEN: Record<string, (n: Nutzlast) => Promise<ZeitErgebnis>> = {
  zeit_anlegen: (n) => zeitenAnlegen(n),
  zeit_aendern: (n) => zeitAendern(String(n.id), n.daten),
  zeit_archivieren: (n) => zeitArchivieren(String(n.id)),
};

export type SendeErgebnis =
  | { status: "gespeichert" }
  | { status: "abgelehnt"; fehler: string }
  /** Keine Antwort (z. B. kein Netz): bleibt auf dem Gerät und wird später gesendet. */
  | { status: "wartet" };

/**
 * Merkt den Auftrag auf dem Gerät, schickt ihn ab und räumt nach Erfolg auf.
 * abgelehntBehalten: Bei einer Ablehnung durch den Server den Auftrag mit
 * Fehlermeldung behalten (Warteschlange) oder entfernen (Formular zeigt den Fehler).
 */
export async function auftragSenden(
  userId: string,
  auftrag: Omit<Auftrag, "erstelltAm" | "fehler">,
  { abgelehntBehalten }: { abgelehntBehalten: boolean },
): Promise<SendeErgebnis> {
  const aktion = AKTIONEN[auftrag.typ];
  if (!aktion) return { status: "abgelehnt", fehler: "Unbekannter Vorgang." };

  const { schluessel, typ, titel, nutzlast } = auftrag; // ohne alte Fehlermeldung
  auftragMerken(userId, { schluessel, typ, titel, nutzlast });
  let ergebnis: ZeitErgebnis;
  try {
    ergebnis = await aktion((nutzlast ?? {}) as Nutzlast);
  } catch {
    return { status: "wartet" };
  }

  if (ergebnis.fehler) {
    if (abgelehntBehalten) auftragFehlerMerken(userId, schluessel, ergebnis.fehler);
    else auftragEntfernen(userId, schluessel);
    return { status: "abgelehnt", fehler: ergebnis.fehler };
  }
  auftragEntfernen(userId, schluessel);
  return { status: "gespeichert" };
}
