import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RollenBadge, StatusBadges } from "../rollen-badge";
import { PasswortZuruecksetzen } from "./passwort-zuruecksetzen";
import { StammdatenFormular } from "./stammdaten-formular";
import { ZugangSperren } from "./zugang-sperren";

export const metadata: Metadata = { title: "Benutzer bearbeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{titel}</h2>
      {children}
    </section>
  );
}

export default async function BenutzerDetailSeite({
  params,
}: PageProps<"/buero/einstellungen/benutzer/[id]">) {
  const admin = await requireRole(["admin"]);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("id, benutzername, vorname, nachname, rolle, telefon, email, urlaubstage_jahr, aktiv, muss_passwort_aendern, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const { data: auth } = await createAdminClient().auth.admin.getUserById(id);
  const istSelbst = p.id === admin.id;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/buero/einstellungen/benutzer"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Benutzer & Rollen
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {p.vorname} {p.nachname}
          </h1>
          <RollenBadge rolle={p.rolle} />
          <StatusBadges aktiv={p.aktiv} mussPasswortAendern={p.muss_passwort_aendern} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Benutzername</dt>
          <dd className="font-mono">{p.benutzername}</dd>
          <dt className="text-muted-foreground">Angelegt am</dt>
          <dd>{formatDatum(p.created_at)}</dd>
          <dt className="text-muted-foreground">Letzte Anmeldung</dt>
          <dd>{auth?.user?.last_sign_in_at ? formatDatumZeit(auth.user.last_sign_in_at) : "noch nie"}</dd>
        </dl>
      </div>

      <Abschnitt titel="Daten & Rolle">
        <StammdatenFormular
          id={p.id}
          istSelbst={istSelbst}
          werte={{
            vorname: p.vorname,
            nachname: p.nachname,
            rolle: p.rolle,
            telefon: p.telefon ?? "",
            email: p.email ?? "",
            urlaubstage: p.urlaubstage_jahr == null ? "" : String(p.urlaubstage_jahr),
          }}
        />
        <p className="text-sm text-muted-foreground">
          Der Benutzername kann nicht geändert werden.
        </p>
      </Abschnitt>

      <Abschnitt titel="Passwort">
        {istSelbst ? (
          <Link href="/passwort-aendern" className={buttonVariants({ variant: "outline", size: "lg", className: "w-fit" })}>
            Eigenes Passwort ändern
          </Link>
        ) : (
          <PasswortZuruecksetzen id={p.id} vorname={p.vorname} benutzername={p.benutzername} />
        )}
      </Abschnitt>

      <Abschnitt titel="Zugang">
        {istSelbst ? (
          <p className="text-sm text-muted-foreground">
            Du kannst deinen eigenen Zugang nicht sperren.
          </p>
        ) : (
          // key: nach Sperren/Entsperren neu starten (Bestätigung zurücksetzen)
          <ZugangSperren key={String(p.aktiv)} id={p.id} vorname={p.vorname} aktiv={p.aktiv} />
        )}
      </Abschnitt>
    </div>
  );
}
