import type { Metadata } from "next";
import { DarstellungFormular } from "@/components/darstellung-formular";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { ladeRechte, requireUser } from "@/lib/auth";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { rechtOk } from "@/lib/rechte";
import { istBueroRolle } from "@/lib/rollen";

export const metadata: Metadata = { title: "Darstellung" };

/** Darstellung in der Mitarbeiter-App (Farbe; Büro-Nutzer zusätzlich die Seitenleiste). */
export default async function DarstellungSeite() {
  const nutzer = await requireUser();
  const [{ eigene, firma }, rechte] = await Promise.all([darstellungLaden(), ladeRechte()]);
  const istBuero = istBueroRolle(nutzer.rolle);

  return (
    <div className="flex flex-col gap-5">
      <SeitenKopf titel="Darstellung" zurueck="/einstellungen" />
      <DarstellungFormular
        key={JSON.stringify([eigene, firma])}
        eigene={eigene}
        firma={firma}
        istBuero={istBuero}
        istAdmin={nutzer.rolle === "admin"}
        darfVorgabe={istBuero && (nutzer.rolle === "admin" || rechtOk(rechte, "einstellungen_firma"))}
        rechte={rechte}
      />
    </div>
  );
}
