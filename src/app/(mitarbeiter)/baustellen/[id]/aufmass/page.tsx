import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { EINHEIT_NAMEN, abzugBewerten, aufmassSummen } from "@/lib/aufmass";
import { aufmassLaden, baustelleMitRechten } from "@/lib/baustellen-daten";
import { formatZahl } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { Warteschlange } from "../../../warteschlange";

export const metadata: Metadata = { title: "Aufmaß" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const m = (z: number | null) => formatZahl(z, { min: 2, max: 3 });

export default async function AufmassSeite({ params }: PageProps<"/baustellen/[id]/aufmass">) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const rechte = await baustelleMitRechten(nutzer, id);
  if (!rechte) notFound();
  const [zeilen, kollegen] = await Promise.all([aufmassLaden(id), kollegenLaden()]);

  const raeume = [...new Set(zeilen.map((z) => z.raum))];
  const summen = aufmassSummen(zeilen);
  const wer = (uid: string | null) => (uid === nutzer.id ? "dir" : (uid && kollegen.get(uid)?.vorname) || "ehemaliger Kollege");

  return (
    <div className="flex flex-col gap-5">
      <Warteschlange userId={nutzer.id} />

      {rechte.darfInhalte && (
        <Link href={`/baustellen/${id}/aufmass/neu`} className={buttonVariants({ size: "touch", className: "w-full" })}>
          <PlusIcon /> Aufmaß hinzufügen
        </Link>
      )}

      {zeilen.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Noch kein Aufmaß.</p>}

      {summen.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <h2 className="font-semibold">Summen</h2>
          <ul className="flex flex-col gap-1">
            {summen.map((s) => (
              <li key={`${s.position}|${s.einheit}`} className="flex justify-between gap-3">
                <span>{s.position}</span>
                <span className="shrink-0 font-semibold">{formatZahl(s.menge, { min: 2, max: 2 })} {EINHEIT_NAMEN[s.einheit]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {raeume.map((raum) => (
        <section key={raum} className="flex flex-col gap-2">
          <h2 className="px-1 text-lg font-semibold">{raum}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {zeilen.filter((z) => z.raum === raum).map((z) => {
              const masse =
                z.einheit === "m2" ? `${m(z.laenge)} × ${m(z.hoehe)} m` : z.einheit === "m" ? `${m(z.laenge)} m` : "";
              const abzuege = z.abzuege.map(abzugBewerten);
              const abgezogen = abzuege.filter((a) => !a.uebermessen);
              const uebermessen = abzuege.filter((a) => a.uebermessen);
              const inhalt = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{z.position}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[masse, z.anzahl !== 1 || z.einheit === "stk" ? `${formatZahl(z.anzahl)}×` : ""].filter(Boolean).join(" · ")}
                      {abgezogen.length > 0 && ` · ${abgezogen.length} abgezogen`}
                      {uebermessen.length > 0 && ` · ${uebermessen.length} übermessen`}
                    </span>
                    {z.bemerkung && <span className="block text-sm">{z.bemerkung}</span>}
                    <span className="block text-xs text-muted-foreground">von {wer(z.erstelltVon)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatZahl(z.menge, { min: 2, max: 2 })} {EINHEIT_NAMEN[z.einheit]}</span>
                </>
              );
              return (
                <li key={z.id}>
                  {rechte.darfAendern(z.erstelltVon) && !rechte.projekt.archiviert_am ? (
                    <Link href={`/baustellen/${id}/aufmass/${z.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                      {inhalt}
                      <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{inhalt}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
