import type { Metadata } from "next";
import { BuildingIcon, PhoneIcon, SearchIcon, UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import { nachBuchstabenGruppieren } from "@/lib/kontakt-gruppen";
import { kontaktName, telLink } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kontakte" };

const FARBEN: Record<string, string> = {
  rot: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  gruen: "bg-green-100 text-green-700",
  blau: "bg-blue-100 text-blue-700",
  lila: "bg-purple-100 text-purple-700",
  grau: "bg-muted text-muted-foreground",
};

// Mitarbeiter sehen (per RLS) nur die Kunden ihrer eigenen und der archivierten Projekte.
export default async function KontakteSeite({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const suche = (q ?? "").trim().slice(0, 60).replace(/[%,()*]/g, " ").trim();

  const supabase = await createClient();
  let abfrage = supabase
    .from("contacts")
    .select("id, typ, firmenname, vorname, nachname, kundennummer, telefon, mobil, farbe")
    .is("archiviert_am", null)
    .limit(300);
  if (suche) {
    const m = `%${suche}%`;
    abfrage = abfrage.or(
      `firmenname.ilike.${m},vorname.ilike.${m},nachname.ilike.${m},kundennummer.ilike.${m},ort.ilike.${m},strasse.ilike.${m}`,
    );
  }
  const { data } = await abfrage;
  const gruppen = nachBuchstabenGruppieren(data ?? []);

  return (
    <div className="flex flex-col gap-4">
      <form method="get" role="search" className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={suche} placeholder="Suchen" className="h-12 pl-10 text-base" />
      </form>

      {gruppen.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">
          {suche ? "Nichts gefunden." : "Hier erscheinen die Kunden deiner Baustellen."}
        </p>
      )}

      {gruppen.map((g) => (
        <section key={g.buchstabe} className="flex flex-col gap-1">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{g.buchstabe}</h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {g.kontakte.map((k) => {
              const tel = telLink(k.mobil || k.telefon);
              return (
                <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${FARBEN[k.farbe ?? ""] ?? FARBEN.grau}`}>
                    {k.typ === "firma" ? <BuildingIcon className="size-5" /> : <UserIcon className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{kontaktName(k)}</span>
                    {k.kundennummer && <span className="block truncate text-sm text-muted-foreground">{k.kundennummer}</span>}
                  </span>
                  {tel && (
                    <a href={tel} aria-label={`${kontaktName(k)} anrufen`} className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted">
                      <PhoneIcon className="size-5" />
                    </a>
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
