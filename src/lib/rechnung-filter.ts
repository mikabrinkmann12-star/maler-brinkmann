import { istRechnungAnzeigeStatus, type RechnungAnzeigeStatus } from "@/lib/rechnung-liste";
import { istTag } from "@/lib/zeitraum";

/** Höchstzahl Dateien je Sammel-Download */
export const SAMMEL_MAX_DATEIEN = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filter der Rechnungsliste aus der Adresse (q, archiv, netto, status, projekt, von/bis). Gilt für die Liste und für den Sammel-Download. */
export type RechnungListenFilter = {
  q: string;
  archiv: boolean;
  netto: boolean;
  status: RechnungAnzeigeStatus[];
  projektIds: string[];
  zeitraum: { von: string; bis: string } | null;
};

export function rechnungFilterLesen(params: Record<string, string | string[] | undefined> | URLSearchParams): RechnungListenFilter {
  const wert = (n: string) => {
    const w = params instanceof URLSearchParams ? params.get(n) : params[n];
    return typeof w === "string" ? w : "";
  };
  return {
    q: wert("q").trim(),
    archiv: wert("archiv") === "1",
    netto: wert("netto") === "1",
    status: wert("status").split(",").filter(istRechnungAnzeigeStatus),
    projektIds: wert("projekt").split(",").filter((x) => UUID.test(x)),
    zeitraum: istTag(wert("von")) && istTag(wert("bis")) ? { von: wert("von"), bis: wert("bis") } : null,
  };
}
