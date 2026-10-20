import type { Metadata } from "next";
import { ContainerIcon, LockIcon } from "lucide-react";
import { ContainerKarte } from "@/components/container-karte";
import { requireBueroRecht } from "@/lib/auth";
import { CONTAINER_NAMEN, restText, sperreBis } from "@/lib/container";
import { containerMeldungenLaden } from "@/lib/container-daten";
import { formatDatumZeit } from "@/lib/format";
import { ContainerAktionen } from "./container-verwaltung";

export const metadata: Metadata = { title: "Container" };

export default async function ContainerSeite() {
  await requireBueroRecht("container_verwalten");
  const meldungen = await containerMeldungenLaden(40);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Container</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Mitarbeiter melden Papier- oder Restmüllcontainer mit einem Knopf. Danach ist genau diese Art für alle 7 Tage gesperrt. Hier markierst du Meldungen als erledigt (z. B. bestellt) und kannst die Sperre aufheben.
        </p>
      </div>

      <ContainerKarte meldungen={meldungen} />

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ContainerIcon className="size-5" /> Meldungen</h2>
        {meldungen.length === 0 && <p className="text-muted-foreground">Noch keine Meldung.</p>}
        <ul className="flex flex-col divide-y rounded-lg border bg-white">
          {meldungen.map((m) => {
            const bis = sperreBis([m], m.art);
            return (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{CONTAINER_NAMEN[m.art]}</p>
                  <p className="text-sm text-muted-foreground">Gemeldet von {m.wer} am {formatDatumZeit(m.zeit)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={m.erledigt ? "rounded-full bg-green-100 px-2 py-0.5 text-green-800" : "rounded-full bg-amber-100 px-2 py-0.5 text-amber-900"}>{m.erledigt ? "Erledigt" : "Offen"}</span>
                    {bis && <span className="inline-flex items-center gap-1 text-muted-foreground"><LockIcon className="size-3" /> gesperrt, {restText(bis)}</span>}
                    {m.freigegeben && <span className="text-muted-foreground">Sperre aufgehoben</span>}
                  </p>
                  {m.notiz && <p className="mt-1 text-sm">{m.notiz}</p>}
                </div>
                <ContainerAktionen id={m.id} erledigt={m.erledigt} gesperrt={bis !== null} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
