"use client";

import { useState, useTransition } from "react";
import { UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { AnrufLink } from "@/components/anruf-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { kollegeEntfernen, kollegeHinzufuegen } from "../actions";

type Person = { id: string; vorname: string; nachname: string; telefon: string | null };

export function Team({
  projektId,
  ichId,
  darfHinzufuegen,
  darfEntfernen,
  team,
  kollegen,
}: {
  projektId: string;
  ichId: string;
  darfHinzufuegen: boolean;
  darfEntfernen: boolean;
  team: Person[];
  kollegen: Person[];
}) {
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();
  const teamIds = new Set(team.map((t) => t.id));
  const auswahl = kollegen.filter((k) => !teamIds.has(k.id));

  function hinzufuegen(k: Person) {
    starte(async () => {
      const e = await kollegeHinzufuegen(projektId, k.id);
      if (e.fehler) toast.error(e.fehler);
      else {
        toast.success(`${k.vorname} ist jetzt auf der Baustelle.`);
        setOffen(false);
      }
    });
  }

  function entfernen(k: Person) {
    if (!window.confirm(`${k.vorname} ${k.nachname} von der Baustelle entfernen?`)) return;
    starte(async () => {
      const e = await kollegeEntfernen(projektId, k.id);
      if (e.fehler) toast.error(e.fehler);
      else toast.success(`${k.vorname} wurde entfernt.`);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Team ({team.length})</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {team.map((k) => (
          <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>
              {k.vorname} {k.nachname}
              {k.id === ichId && <span className="text-muted-foreground"> (du)</span>}
            </span>
            <span className="flex gap-2">
              {k.id !== ichId && <AnrufLink nummer={k.telefon} name={k.vorname} />}
              {darfEntfernen && (
                <Button type="button" variant="outline" size="icon-lg" aria-label={`${k.vorname} entfernen`}
                  onClick={() => entfernen(k)} disabled={laeuft}>
                  <XIcon />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {darfHinzufuegen && (
        <>
          <Button type="button" size="touch" className="w-full" onClick={() => setOffen(true)}>
            <UserPlusIcon />
            Kollegen hinzufügen
          </Button>
          <Sheet open={offen} onOpenChange={setOffen}>
            <SheetContent side="bottom" className="max-h-[80dvh] gap-3 p-4">
              <SheetTitle className="text-lg">Wen nimmst du mit?</SheetTitle>
              <SheetDescription>Antippen – der Kollege kann sofort Zeit auf dieser Baustelle eintragen.</SheetDescription>
              <ul className="flex flex-col gap-2 overflow-y-auto">
                {auswahl.length === 0 && <li className="text-muted-foreground">Alle Kollegen sind schon dabei.</li>}
                {auswahl.map((k) => (
                  <li key={k.id}>
                    <Button type="button" variant="outline" size="touch" className="w-full justify-start"
                      disabled={laeuft} onClick={() => hinzufuegen(k)}>
                      {k.vorname} {k.nachname}
                    </Button>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </>
      )}
    </section>
  );
}
