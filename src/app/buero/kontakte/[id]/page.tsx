import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDatum, formatZahl } from "@/lib/format";
import { briefanschrift, kontaktAnzeigename } from "@/lib/kontakt-schema";
import { telLink } from "@/lib/projekt";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ArchivierenKnopf } from "./archivieren-knopf";

export const metadata: Metadata = { title: "Kontakt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-5 first:border-0 first:pt-0">
      <h2 className="text-lg font-semibold">{titel}</h2>
      {children}
    </section>
  );
}

export default async function KontaktSeite({ params }: PageProps<"/buero/kontakte/[id]">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: k }, { data: projekte }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("projects")
      .select("id, projektnummer, name, archiviert_am, created_at, project_statuses(name, farbe)")
      .eq("contact_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!k) notFound();

  const anschrift = briefanschrift(k);
  const adresse = [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean);
  const mailto = k.email ? `mailto:${k.email}` : null;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/buero/kontakte" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Kontakte
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {kontaktAnzeigename(k)}
          {k.archiviert_am && <span className="ml-2 rounded-full bg-muted px-3 py-1 align-middle text-sm font-normal text-muted-foreground">archiviert</span>}
        </h1>
        <div className="flex gap-2">
          <ArchivierenKnopf id={id} archiviert={Boolean(k.archiviert_am)} />
          <Link href={`/buero/kontakte/${id}/bearbeiten`} className={buttonVariants({ size: "lg" })}>
            <PencilIcon /> Bearbeiten
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5 rounded-xl border p-5">
          <Abschnitt titel="Allgemein">
            <dl>
              <Zeile label="Typ">{k.typ === "firma" ? "Firma" : "Person"}</Zeile>
              <Zeile label="Name">{kontaktAnzeigename(k)}</Zeile>
              {k.ansprechpartner && <Zeile label="Ansprechpartner">{k.ansprechpartner}</Zeile>}
              {k.anrede && <Zeile label="Anrede">{k.anrede}</Zeile>}
              <Zeile label="Kundennummer">{k.kundennummer ?? "–"}</Zeile>
              <Zeile label="E-Mail">{mailto ? <a href={mailto} className="underline-offset-4 hover:underline">{k.email}</a> : "–"}</Zeile>
              <Zeile label="Telefon">
                {k.telefon ? <a href={telLink(k.telefon) ?? undefined} className="underline-offset-4 hover:underline">{k.telefon}</a> : "–"}
              </Zeile>
              <Zeile label="Mobil">
                {k.mobil ? <a href={telLink(k.mobil) ?? undefined} className="underline-offset-4 hover:underline">{k.mobil}</a> : "–"}
              </Zeile>
              <Zeile label="Webseite">{k.website || "Noch keine Webseite"}</Zeile>
            </dl>
          </Abschnitt>

          <Abschnitt titel="Beschreibung">
            {k.notizen ? <p className="whitespace-pre-line">{k.notizen}</p> : <p className="text-muted-foreground italic">Keine Beschreibung</p>}
          </Abschnitt>

          <Abschnitt titel="Adresse">
            {adresse.length ? (
              <address className="w-fit rounded-lg bg-muted px-4 py-3 not-italic">{adresse.map((z, i) => <p key={i}>{z}</p>)}</address>
            ) : <p className="text-muted-foreground italic">Keine Adresse</p>}
          </Abschnitt>

          <Abschnitt titel="Empfänger">
            <address className="w-fit rounded-lg bg-muted px-4 py-3 not-italic">{anschrift.map((z, i) => <p key={i}>{z}</p>)}</address>
            {k.empfaenger && <p className="text-sm text-muted-foreground">Von Hand eingetragen.</p>}
          </Abschnitt>

          <Abschnitt titel="Zahlungsziel & Skonto">
            {k.zahlungsziel_tage === null && k.skonto_prozent === null ? (
              <p className="text-muted-foreground">Keine Zahlungsbedingungen</p>
            ) : (
              <dl>
                <Zeile label="Zahlungsziel">{k.zahlungsziel_tage === null ? "–" : `${k.zahlungsziel_tage} Tage`}</Zeile>
                {k.skonto_prozent !== null && <Zeile label="Skonto">{formatZahl(Number(k.skonto_prozent))} % innerhalb von {k.skonto_tage} Tagen</Zeile>}
              </dl>
            )}
          </Abschnitt>

          <Abschnitt titel="Steuer">
            <dl>
              <Zeile label="Steuersatz">{formatZahl(Number(k.steuersatz))} %</Zeile>
              {k.leitweg_id && <Zeile label="Leitweg-ID">{k.leitweg_id}</Zeile>}
            </dl>
          </Abschnitt>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">Projekte</h2>
            {!projekte?.length && <p className="text-muted-foreground">Noch keine Projekte.</p>}
            <ul className="flex flex-col gap-3">
              {projekte?.map((p) => (
                <li key={p.id} className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: p.project_statuses?.farbe ?? "#94a3b8" }} />
                    {p.project_statuses?.name} · {p.projektnummer} · {formatDatum(p.created_at)}{p.archiviert_am && " · archiviert"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
