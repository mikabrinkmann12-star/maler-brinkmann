import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDatumZeit } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RollenBadge, StatusBadges } from "./rollen-badge";

export const metadata: Metadata = { title: "Benutzer & Rollen" };

export default async function BenutzerSeite() {
  await requireRole(["admin"]);

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, benutzername, vorname, nachname, rolle, telefon, aktiv, muss_passwort_aendern")
    .order("aktiv", { ascending: false })
    .order("nachname")
    .order("vorname");
  if (error) throw new Error("Benutzer konnten nicht geladen werden.");

  // Letzte Anmeldung steht nur in Supabase Auth (Admin-Client, nach requireRole).
  const { data: auth } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const letzteAnmeldung = new Map(
    (auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );

  const anzahlAktiv = profile.filter((p) => p.aktiv).length;
  const anzahlGesperrt = profile.length - anzahlAktiv;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Mitarbeiter</h1>
            <p className="text-sm text-muted-foreground">
              {anzahlAktiv} aktiv
              {anzahlGesperrt > 0 && ` · ${anzahlGesperrt} gesperrt`}
            </p>
          </div>
          <Link
            href="/buero/einstellungen/benutzer/neu"
            className={buttonVariants({ size: "lg" })}
          >
            <PlusIcon />
            Neuer Benutzer
          </Link>
        </div>
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        {profile.map((p) => {
          const anmeldung = letzteAnmeldung.get(p.id);
          return (
            <li key={p.id}>
              <Link
                href={`/buero/einstellungen/benutzer/${p.id}`}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted md:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
              >
                <div className="min-w-0">
                  <p className={p.aktiv ? "truncate font-medium" : "truncate font-medium text-muted-foreground line-through"}>
                    {p.vorname} {p.nachname}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{p.benutzername}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
                  <RollenBadge rolle={p.rolle} />
                </div>
                <p className="hidden truncate text-sm text-muted-foreground md:block">
                  {p.telefon ?? ""}
                </p>
                <p className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:text-sm">
                  <span className="md:hidden">Letzte Anmeldung: </span>
                  {anmeldung ? formatDatumZeit(anmeldung) : "noch nie"}
                </p>
                <div className="col-span-2 flex items-center gap-1 md:col-span-1 md:justify-end">
                  <StatusBadges aktiv={p.aktiv} mussPasswortAendern={p.muss_passwort_aendern} />
                  <ChevronRightIcon className="hidden size-5 text-muted-foreground md:block" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
