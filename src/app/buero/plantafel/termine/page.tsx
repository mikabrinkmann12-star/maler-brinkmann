import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ChevronRightIcon, MapPinIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum, tageVerschieben } from "@/lib/datum";
import { formatDatumLang } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { termineLaden } from "@/lib/termine-daten";
import { Warteschlange } from "../../../(mitarbeiter)/warteschlange";
import { PlantafelTabs } from "../tabs";

export const metadata: Metadata = { title: "Termine" };

export default async function BueroTermineSeite({ searchParams }: PageProps<"/buero/plantafel/termine">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const { datum: datumParam } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heuteIso();
  const supabase = await createClient();
  const [termine, { data: profile }] = await Promise.all([
    termineLaden({ ab: datum, bis: tageVerschieben(datum, 60) }),
    supabase.from("profiles").select("id, vorname, nachname"),
  ]);
  const name = (id: string) => profile?.find((p) => p.id === id)?.vorname ?? "?";
  const tage = [...new Set(termine.map((t) => t.datum))];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PlantafelTabs aktiv="termine" datum={datum} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Termine</h1>
          <p className="text-sm text-muted-foreground">Die nächsten 60 Tage ab {formatDatumLang(datum)}. Mitarbeiter tragen eigene Termine selbst ein.</p>
        </div>
        <Link href={`/buero/plantafel/termine/neu?datum=${datum}`} className={buttonVariants({ size: "lg" })}>
          <PlusIcon /> Termin eintragen
        </Link>
      </div>
      <Warteschlange userId={nutzer.id} />

      {tage.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Keine Termine in diesem Zeitraum.</p>}
      {tage.map((tag) => (
        <section key={tag} className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold">
            <Link href={`/buero/plantafel?datum=${tag}`} className="underline-offset-4 hover:underline">{formatDatumLang(tag)}</Link>
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {termine.filter((t) => t.datum === tag).map((t) => (
              <li key={t.id}>
                <Link href={`/buero/plantafel/termine/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  <CalendarClockIcon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.zeit && `${t.zeit} Uhr · `}{t.titel}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t.personIds.map(name).join(", ") || "niemand zugeordnet"}
                    </span>
                    {(t.ort || t.projektName) && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5" /> {[t.projektName, t.ort].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
