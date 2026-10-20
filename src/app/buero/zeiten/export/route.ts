import { requireBueroRecht } from "@/lib/auth";
import { istMonat } from "@/lib/datum";
import { istZeitArt } from "@/lib/zeiten";
import {
  eintraegeSortieren,
  einzelCsv,
  summenCsv,
  summenJePerson,
  zeitenFiltern,
} from "@/lib/zeiten-auswertung";
import { bueroPersonen, monatsEintraege, personenNamen } from "@/lib/zeiten-buero-daten";

// CSV-Export der Zeiten eines Monats (Büro/Admin) – für den Lohn und für Excel.
// ?monat=JJJJ-MM&typ=summen|einzeln und optional dieselben Filter wie die Seite.

export const dynamic = "force-dynamic";

export async function GET(anfrage: Request) {
  // Route Handler laufen ohne Layout: die Rolle muss hier selbst geprüft werden.
  await requireBueroRecht("zeiten_alle");

  const url = new URL(anfrage.url);
  const monat = url.searchParams.get("monat");
  if (!istMonat(monat)) return new Response("Bitte einen Monat angeben (JJJJ-MM).", { status: 400 });
  const typ = url.searchParams.get("typ") === "einzeln" ? "einzeln" : "summen";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const liste = (n: string) => (url.searchParams.get(n) ?? "").split(",").filter(Boolean);
  const filter = {
    personIds: liste("person").filter((x) => uuid.test(x)),
    projektIds: liste("projekt").filter((x) => uuid.test(x)),
    arten: liste("art").filter(istZeitArt),
    q: url.searchParams.get("q") ?? "",
  };

  const [personen, alle] = await Promise.all([bueroPersonen(), monatsEintraege(monat)]);
  const namen = personenNamen(personen);
  const eintraege = zeitenFiltern(alle, filter, namen);
  const csv =
    typ === "einzeln"
      ? einzelCsv(eintraegeSortieren(eintraege, namen), namen)
      : summenCsv(summenJePerson(eintraege, namen));

  // Das BOM (﻿) sorgt dafür, dass Excel Umlaute richtig anzeigt.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeiten-${typ}-${monat}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
