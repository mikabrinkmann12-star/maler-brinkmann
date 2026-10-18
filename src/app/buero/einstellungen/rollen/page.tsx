import type { Metadata } from "next";
import { CheckIcon, MinusIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLLEN_NAMEN, type Rolle } from "@/lib/rollen";
import { RECHTE, type Recht } from "@/lib/rollenrechte";

export const metadata: Metadata = { title: "Rollen & Zugriffsrechte" };

const ROLLEN: Rolle[] = ["mitarbeiter", "buero", "admin"];

function Zeichen({ recht }: { recht: Recht }) {
  if (recht === "ja") return <CheckIcon className="mx-auto size-4 text-green-600" aria-label="darf" />;
  if (recht === "nein") return <MinusIcon className="mx-auto size-4 text-muted-foreground/50" aria-label="darf nicht" />;
  return <span className="text-xs font-medium text-muted-foreground">{recht === "eigene" ? "nur eigene" : "nur lesen"}</span>;
}

export default async function RollenSeite() {
  await requireRole(["admin"]);
  // Wer hat welche Rolle? (Anzahl aktiver Personen je Rolle)
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("rolle, vorname, nachname").eq("aktiv", true).order("vorname");
  const personen = (rolle: Rolle) => (profile ?? []).filter((p) => p.rolle === rolle).map((p) => `${p.vorname} ${p.nachname}`.trim());

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Rollen &amp; Zugriffsrechte</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Es gibt drei Rollen. Die Rechte sind fest eingebaut und werden von der Datenbank erzwungen, nicht nur im Menü versteckt. Die Rolle einer Person
          änderst du unter „Mitarbeiter“.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ROLLEN.map((r) => (
          <div key={r} className="rounded-lg border bg-white p-3">
            <p className="text-[13px] font-semibold">{ROLLEN_NAMEN[r]}</p>
            <p className="mb-1.5 text-xs text-muted-foreground">{personen(r).length} {personen(r).length === 1 ? "Person" : "Personen"}</p>
            <p className="text-[13px]">{personen(r).join(", ") || "–"}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-xs font-semibold">
              <th className="px-3 py-2.5 text-left">Funktion</th>
              {ROLLEN.map((r) => <th key={r} className="w-28 px-3 py-2.5 text-center">{ROLLEN_NAMEN[r]}</th>)}
            </tr>
          </thead>
          {RECHTE.map((g) => (
            <tbody key={g.titel}>
              <tr className="bg-muted/40"><th colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold">{g.titel}</th></tr>
              {g.zeilen.map((z) => (
                <tr key={z.funktion} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{z.funktion}</td>
                  {ROLLEN.map((r) => <td key={r} className="px-3 py-2 text-center"><Zeichen recht={z.rechte[r]} /></td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
