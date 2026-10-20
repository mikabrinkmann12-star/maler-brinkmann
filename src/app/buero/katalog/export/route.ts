import { requireBueroRecht } from "@/lib/auth";
import { KATALOG_ART_NAMEN, istKatalogArt, ordnerPfadText } from "@/lib/katalog";
import { ordnerLaden } from "@/lib/katalog-daten";
import { createClient } from "@/lib/supabase/server";
import { csvText, csvZusammensetzen } from "@/lib/zeiten-auswertung";

// CSV-Export der Materialien bzw. Leistungen (Büro/Admin, nicht archivierte Einträge). Die Spalten passen zum CSV-Import,
// so lässt sich eine Datei in Excel bearbeiten und wieder einlesen. ?art=material|leistung

export const dynamic = "force-dynamic";

const zahl = (n: number) => String(n).replace(".", ",");

export async function GET(anfrage: Request) {
  // Route Handler laufen ohne Layout: die Rolle muss hier selbst geprüft werden.
  await requireBueroRecht("katalog");
  const art = new URL(anfrage.url).searchParams.get("art");
  if (!istKatalogArt(art)) return new Response("Bitte die Art angeben (material oder leistung).", { status: 400 });

  const supabase = await createClient();
  const ordner = await ordnerLaden(art);
  const pfad = (id: string | null) => ordnerPfadText(ordner, id).replace(/ › /g, " > ");
  const SEITE = 1000;
  const zeilen: string[][] = [];

  for (let von = 0; ; von += SEITE) {
    if (art === "material") {
      const { data, error } = await supabase
        .from("materials")
        .select("folder_id, artikelnr, name, lieferant, einheit, ek, zuschlag_prozent, vk, beschreibung")
        .is("archiviert_am", null)
        .order("name")
        .order("id")
        .range(von, von + SEITE - 1);
      if (error) return new Response("Der Export hat nicht geklappt.", { status: 500 });
      for (const m of data) {
        zeilen.push([pfad(m.folder_id), m.artikelnr ?? "", m.name, m.lieferant ?? "", m.einheit, zahl(Number(m.ek)), zahl(Number(m.zuschlag_prozent)), zahl(Number(m.vk)), m.beschreibung ?? ""].map(csvText));
      }
      if (data.length < SEITE) break;
    } else {
      const { data, error } = await supabase
        .from("services")
        .select("folder_id, nummer, name, langtext, einheit, kosten, zuschlag_prozent, vk")
        .is("archiviert_am", null)
        .order("name")
        .order("id")
        .range(von, von + SEITE - 1);
      if (error) return new Response("Der Export hat nicht geklappt.", { status: 500 });
      for (const s of data) {
        zeilen.push([pfad(s.folder_id), s.nummer ?? "", s.name, s.langtext ?? "", s.einheit, zahl(Number(s.kosten)), zahl(Number(s.zuschlag_prozent)), zahl(Number(s.vk))].map(csvText));
      }
      if (data.length < SEITE) break;
    }
  }

  const kopf =
    art === "material"
      ? ["Ordner", "Artikelnummer", "Bezeichnung", "Lieferant", "Einheit", "Einkaufspreis", "Zuschlag", "Verkaufspreis", "Beschreibung"]
      : ["Ordner", "Nummer", "Kurztext", "Langtext", "Einheit", "Kosten", "Zuschlag", "Verkaufspreis"];
  const csv = csvZusammensetzen([kopf, ...zeilen]);

  // Das BOM (﻿) sorgt dafür, dass Excel Umlaute richtig anzeigt.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${KATALOG_ART_NAMEN[art].toLowerCase()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
