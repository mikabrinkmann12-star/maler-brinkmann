import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { rechteAusZeilen } from "@/lib/rechte";
import { ROLLEN_NAMEN, type Rolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { RechteEditor } from "./rechte-editor";

export const metadata: Metadata = { title: "Rollen & Zugriffsrechte" };

const ROLLEN: Rolle[] = ["mitarbeiter", "buero", "admin"];

export default async function RollenSeite() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: profile }, { data: zeilen }] = await Promise.all([
    supabase.from("profiles").select("rolle, vorname, nachname").eq("aktiv", true).order("vorname"),
    supabase.from("role_permissions").select("rolle, recht, stufe"),
  ]);
  const personen = (rolle: Rolle) => (profile ?? []).filter((p) => p.rolle === rolle).map((p) => `${p.vorname} ${p.nachname}`.trim());
  const rechteVon = (rolle: "mitarbeiter" | "buero") => rechteAusZeilen(rolle, (zeilen ?? []).filter((z) => z.rolle === rolle));

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Rollen &amp; Zugriffsrechte</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Es gibt drei Rollen. Hier stellst du ein, was Büro und Mitarbeiter dürfen. Die Rechte werden von der Datenbank erzwungen, nicht nur im Menü versteckt.
          Als Admin darfst du immer alles. Die Rolle einer Person änderst du unter „Mitarbeiter“.
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          „Nur eigene“ heißt: nur das, was zu den eigenen Projekten und Einträgen gehört. Jede Änderung wird protokolliert.
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

      <RechteEditor gespeichert={{ mitarbeiter: rechteVon("mitarbeiter"), buero: rechteVon("buero") }} />
    </div>
  );
}
