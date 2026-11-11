import type { Metadata } from "next";
import { DarstellungFormular } from "@/components/darstellung-formular";
import { ladeRechte, requireRole } from "@/lib/auth";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { rechtOk } from "@/lib/rechte";
import { BUERO_ROLLEN } from "@/lib/rollen";

export const metadata: Metadata = { title: "Darstellung" };

/** Darstellung im Büro: Farbe und Seitenleiste für sich selbst; mit dem Recht „Firmeneinstellungen“ auch als Vorgabe für alle. */
export default async function BueroDarstellungSeite() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const [{ eigene, firma }, rechte] = await Promise.all([darstellungLaden(), ladeRechte()]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Darstellung</h1>
        <p className="text-sm text-muted-foreground">Gilt nur für dich, auf allen Geräten. Ohne eigene Einstellung gilt die Vorgabe der Firma.</p>
      </div>
      <DarstellungFormular
        key={JSON.stringify([eigene, firma])}
        eigene={eigene}
        firma={firma}
        istBuero
        istAdmin={nutzer.rolle === "admin"}
        darfVorgabe={nutzer.rolle === "admin" || rechtOk(rechte, "einstellungen_firma")}
        rechte={rechte}
      />
    </div>
  );
}
