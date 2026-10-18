"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRingIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { formatDatum } from "@/lib/format";
import { MAHNSTUFEN, mahnstufeName } from "@/lib/mahnung";
import { rechnungMahnstufeSetzen } from "../actions";

/** Vermerk „angemahnt“ bei einer offenen Rechnung. Die Mahnung selbst schreibt das Büro in Lexware; hier steht nur, wie weit gemahnt wurde. */
export function MahnungKarte({ rechnungId, stufe, angemahntAm }: { rechnungId: string; stufe: number; angemahntAm: string | null }) {
  const router = useRouter();
  const [neu, setNeu] = useState(stufe);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await rechnungMahnstufeSetzen(rechnungId, neu);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(neu === 0 ? "Mahnvermerk entfernt." : `„${mahnstufeName(neu)}“ vermerkt.`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <BellRingIcon className={stufe > 0 ? "size-4 text-red-600" : "size-4"} /> Mahnung
        {stufe > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{mahnstufeName(stufe)}{angemahntAm ? ` · ${formatDatum(angemahntAm)}` : ""}</span>}
      </h2>
      <p className="text-sm text-muted-foreground">
        Mahnungen schreibst du in Lexware. Hier vermerkst du nur, wie weit gemahnt wurde, damit die Rechnung auf der Übersicht bei „Angemahnt“ (rot) steht.
      </p>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="flex flex-wrap items-center gap-2">
        <select value={neu} onChange={(e) => setNeu(Number(e.target.value))} aria-label="Mahnstufe" className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
          {MAHNSTUFEN.map((m) => <option key={m.stufe} value={m.stufe}>{m.name}</option>)}
        </select>
        <Button type="button" variant="outline" disabled={laeuft || neu === stufe} onClick={speichern}>{laeuft ? "Speichert …" : "Vermerken"}</Button>
      </div>
    </section>
  );
}
