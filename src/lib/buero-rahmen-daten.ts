import "server-only";
import { ladeRechte, type AktuellerNutzer } from "@/lib/auth";
import { ungelesenZaehler } from "@/lib/benachrichtigung-daten";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { einheitenLaden } from "@/lib/einheiten-daten";
import { firmaLaden } from "@/lib/firma-daten";
import { createClient } from "@/lib/supabase/server";

/** Neue Website-Anfragen für den Zähler im Menü. Ohne das Recht „buero_zugang“ liefert RLS nichts (0). */
async function neueAnfragenZaehlen(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("website_anfragen").select("id", { count: "exact", head: true }).eq("status", "neu").is("archiviert_am", null);
  return count ?? 0;
}

/** Alles, was der Büro-Rahmen (Seitenleiste, Benachrichtigungen, Einheiten, Farben) braucht. Für das Büro-Layout und Projektseiten im Büro-Rahmen. */
export async function bueroRahmenLaden(nutzer: AktuellerNutzer) {
  const [firma, ungelesen, einheiten, rechte, darstellung, anfragenNeu] = await Promise.all([firmaLaden(), ungelesenZaehler(), einheitenLaden(), ladeRechte(), darstellungLaden(), neueAnfragenZaehlen()]);
  const { akzent, reihenfolge, ausgeblendet } = darstellung.wirksam;
  return {
    akzent,
    rahmen: {
      firmenname: firma.name || "Meine Firma",
      name: `${nutzer.vorname} ${nutzer.nachname}`.trim(),
      rolle: nutzer.rolle,
      rechte,
      ungelesen,
      einheiten,
      menue: { reihenfolge, ausgeblendet },
      anfragenNeu,
    },
  };
}
