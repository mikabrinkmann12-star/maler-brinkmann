import type { Metadata } from "next";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { cn } from "cn";
import { ZeitenTabs } from "@/components/zeiten/zeiten-tabs";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatStundenSaldo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { kontenLaden } from "@/lib/ueberstunden-daten";
import { urlaubskonto } from "@/lib/urlaub";

export const metadata: Metadata = { title: "Zeiten – Übersicht" };

/** Übersicht wie in Plancraft: je Mitarbeiter das Arbeitszeitkonto (Überstunden) und der Urlaub des Jahres. */
export default async function ZeitenUebersichtSeite() {
  const nutzer = await requireBueroRecht("zeiten_alle");
  const istAdmin = nutzer.rolle === "admin";
  const supabase = await createClient();
  const heute = heuteIso();
  const jahr = Number(heute.slice(0, 4));

  const [{ data: profile, error }, { data: antraege }, konten, { count: offeneAntraege }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, vorname, nachname, urlaubstage_jahr")
      .eq("aktiv", true)
      .order("vorname")
      .order("nachname"),
    supabase
      .from("leave_requests")
      .select("user_id, von, bis, art, status")
      .in("status", ["offen", "genehmigt"])
      .gte("bis", `${jahr}-01-01`)
      .lte("von", `${jahr}-12-31`),
    kontenLaden({ monat: heute.slice(0, 7) }),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "offen"),
  ]);
  if (error) throw new Error("Die Mitarbeiter konnten nicht geladen werden.");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Zeiten</h1>
      <ZeitenTabs aktiv="uebersicht" offeneAntraege={offeneAntraege ?? 0} />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Mitarbeiter</th>
              <th className="px-3 py-2.5">Arbeitszeitkonto</th>
              <th className="px-3 py-2.5">Urlaub {jahr}</th>
              {istAdmin && <th className="w-10 px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {profile.map((p) => {
              const k = konten.get(p.id);
              const u = urlaubskonto(p.urlaubstage_jahr, (antraege ?? []).filter((a) => a.user_id === p.id), jahr);
              const anteil = u.anspruch ? Math.min(100, Math.round((u.genehmigt / u.anspruch) * 100)) : 0;
              return (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{`${p.vorname} ${p.nachname}`.trim()}</td>
                  <td className={cn("px-3 py-2.5 tabular-nums", k && k.stand < 0 && "font-semibold text-destructive")}>
                    {k ? formatStundenSaldo(k.stand) : <span className="text-muted-foreground">kein Konto</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.anspruch == null ? (
                      <span className="text-muted-foreground">{u.genehmigt} Tage genommen · Anspruch fehlt</span>
                    ) : (
                      <div className="flex max-w-72 flex-col gap-1">
                        <span>
                          {u.genehmigt} von {u.anspruch} Tagen genommen
                          {u.beantragt > 0 && <span className="text-muted-foreground"> · {u.beantragt} beantragt</span>}
                        </span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${anteil}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  {istAdmin && (
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/buero/einstellungen/benutzer/${p.id}`}
                        aria-label={`Arbeitszeit und Urlaub von ${p.vorname} ändern`}
                        title="Arbeitszeit und Urlaub ändern"
                        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <PencilIcon className="size-3.5" />
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Das Arbeitszeitkonto gilt bis gestern (Soll und Ist laut Arbeitszeit der Person). Urlaub zählt genehmigte Werktage des laufenden Jahres, ohne Übertrag.
      </p>
    </div>
  );
}
