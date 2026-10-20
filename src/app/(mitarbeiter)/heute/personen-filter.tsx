"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { personenParam } from "@/lib/einsatz-personen";

type Person = { id: string; name: string; initialen: string };

/**
 * Mitarbeiter-Filter der Einsätze (wie Plancraft: Personen-Symbol, unten ein Fenster mit Suche, Auswahlkreisen,
 * „Anwenden“ und „Zurücksetzen“). Angeboten werden nur ich und meine Teamkollegen des Tages.
 * Die Wahl steht in der Adresse (`?personen=`), dazu bleibt der gewählte Tag (`?datum=`).
 */
export function PersonenFilter({ personen, gewaehlt, ichId, datum }: { personen: Person[]; gewaehlt: string[]; ichId: string; datum: string | null }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [wahl, setWahl] = useState<string[]>(gewaehlt);
  const [suche, setSuche] = useState("");
  const aktiv = !(gewaehlt.length === 1 && gewaehlt[0] === ichId);
  const sichtbar = personen.filter((p) => p.name.toLowerCase().includes(suche.trim().toLowerCase()));

  function oeffnen() {
    setWahl(gewaehlt);
    setSuche("");
    setOffen(true);
  }

  function umschalten(id: string) {
    setWahl((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));
  }

  function gehen(ids: string[]) {
    const teile = new URLSearchParams();
    if (datum) teile.set("datum", datum);
    const p = personenParam(ids, ichId);
    if (p) teile.set("personen", p);
    const text = teile.toString();
    setOffen(false);
    router.push(text ? `/heute?${text}` : "/heute");
  }

  return (
    <>
      <button
        type="button"
        onClick={oeffnen}
        aria-label="Mitarbeiter-Filter"
        className="relative flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
      >
        <UsersIcon className="size-6" />
        {aktiv && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-primary ring-2 ring-background" />}
      </button>
      <Sheet open={offen} onOpenChange={setOffen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-3 p-4">
          <SheetTitle className="text-lg">Mitarbeiter</SheetTitle>
          <SheetDescription>Du siehst dich und die Kollegen, die an diesem Tag mit dir im Auto sitzen.</SheetDescription>
          {personen.length > 4 && (
            <Input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen" aria-label="Mitarbeiter suchen" className="h-12" />
          )}
          <ul className="flex flex-col overflow-y-auto">
            {sichtbar.length === 0 && <li className="py-3 text-muted-foreground">Niemand gefunden.</li>}
            {sichtbar.map((p) => {
              const an = wahl.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => umschalten(p.id)}
                    aria-pressed={an}
                    className="flex min-h-14 w-full items-center gap-3 border-b px-1 text-left last:border-b-0"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{p.initialen}</span>
                    <span className="min-w-0 flex-1 truncate text-base">
                      {p.name}
                      {p.id === ichId && <span className="text-muted-foreground"> (du)</span>}
                    </span>
                    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2", an ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                      {an && <CheckIcon className="size-4" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button type="button" variant="outline" size="touch" onClick={() => gehen([ichId])}>Zurücksetzen</Button>
            <Button type="button" size="touch" disabled={wahl.length === 0} onClick={() => gehen(personen.filter((p) => wahl.includes(p.id)).map((p) => p.id))}>
              Anwenden
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
