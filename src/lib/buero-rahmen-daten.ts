import "server-only";
import { ladeRechte, type AktuellerNutzer } from "@/lib/auth";
import { ungelesenZaehler } from "@/lib/benachrichtigung-daten";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { einheitenLaden } from "@/lib/einheiten-daten";
import { firmaLaden } from "@/lib/firma-daten";

/** Alles, was der Büro-Rahmen (Seitenleiste, Benachrichtigungen, Einheiten, Farben) braucht. Für das Büro-Layout und Projektseiten im Büro-Rahmen. */
export async function bueroRahmenLaden(nutzer: AktuellerNutzer) {
  const [firma, ungelesen, einheiten, rechte, darstellung] = await Promise.all([firmaLaden(), ungelesenZaehler(), einheitenLaden(), ladeRechte(), darstellungLaden()]);
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
    },
  };
}
