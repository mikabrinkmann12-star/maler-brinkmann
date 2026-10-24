"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PercentIcon, ReceiptTextIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zahlLesen } from "@/lib/angebot";
import { rechnungAusAngebotErstellen } from "../../rechnungen/actions";

/**
 * Abschlags- und Schlussrechnung aus einem Angebot (eigene Rechnungen der App). Der Abschlag ist ein Prozentsatz der Netto-Auftragssumme oder ein fester
 * Netto-Betrag; die Schlussrechnung enthält alle Positionen und zieht die gestellten Abschläge beim Fertigstellen ab.
 */
export function Rechnungsarten({ angebotId }: { angebotId: string }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [modus, setModus] = useState<"prozent" | "betrag">("prozent");
  const [wert, setWert] = useState("30");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function los(art: "abschlag" | "schluss") {
    setFehler(null);
    let abschlag: { modus: "prozent"; prozent: number } | { modus: "betrag"; netto: number } | undefined;
    if (art === "abschlag") {
      const zahl = zahlLesen(wert, 2);
      if (zahl === null || zahl <= 0) return setFehler(modus === "prozent" ? "Bitte einen Prozentsatz über 0 eingeben." : "Bitte einen Betrag über 0 eingeben.");
      abschlag = modus === "prozent" ? { modus, prozent: zahl } : { modus, netto: zahl };
    }
    starte(async () => {
      try {
        const r = await rechnungAusAngebotErstellen(angebotId, { art, abschlag });
        if (r.fehler || !r.id) return setFehler(r.fehler ?? "Das hat nicht geklappt.");
        toast.success(r.hinweis ?? (art === "abschlag" ? "Abschlagsrechnung als Entwurf erstellt: bitte prüfen" : "Schlussrechnung als Entwurf erstellt: bitte prüfen"));
        router.push(`/buero/rechnungen/${r.id}`);
      } catch {
        setFehler("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOffen((o) => !o)} disabled={laeuft}><PercentIcon /> Abschlagsrechnung</Button>
      <Button type="button" variant="outline" onClick={() => los("schluss")} disabled={laeuft}><ReceiptTextIcon /> Schlussrechnung</Button>
      {offen && (
        <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border bg-white p-3">
          <label className="flex flex-col gap-1 text-sm">
            Abschlag als
            <select
              aria-label="Abschlag als Prozent oder Betrag"
              value={modus}
              onChange={(e) => { setModus(e.target.value as "prozent" | "betrag"); setWert(e.target.value === "prozent" ? "30" : ""); }}
              className="h-10 rounded-md border bg-white px-2"
            >
              <option value="prozent">Prozent der Auftragssumme</option>
              <option value="betrag">Fester Betrag (netto)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {modus === "prozent" ? "Prozent" : "Betrag netto in €"}
            <Input value={wert} onChange={(e) => setWert(e.target.value)} inputMode="decimal" className="h-10 w-32" />
          </label>
          <Button type="button" onClick={() => los("abschlag")} disabled={laeuft}>{laeuft ? "Erstellt …" : "Abschlagsrechnung anlegen"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOffen(false)} disabled={laeuft}>Abbrechen</Button>
          {fehler && <div className="w-full"><FormularMeldung>{fehler}</FormularMeldung></div>}
        </div>
      )}
      {!offen && fehler && <div className="w-full"><FormularMeldung>{fehler}</FormularMeldung></div>}
    </>
  );
}
