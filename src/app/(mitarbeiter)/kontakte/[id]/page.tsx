import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuildingIcon, MailIcon, PhoneIcon, UserIcon } from "lucide-react";
import { AdressKarte } from "@/components/adress-karte";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireRecht } from "@/lib/auth";
import { appleMapsLink, adresseText, kontaktName, mailLink, mapsLink, telLink } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kontakt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ein Kontakt zum Nachschauen: anrufen, E-Mail schreiben, zur Adresse navigieren. Sichtbar ist nur, was die Datenbank zeigt
// (Kunden der eigenen und der archivierten Projekte).
export default async function KontaktSeite({ params }: PageProps<"/kontakte/[id]">) {
  await requireRecht("kontakte_ansehen");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: k } = await supabase
    .from("contacts")
    .select("id, typ, firmenname, vorname, nachname, kundennummer, ansprechpartner, telefon, mobil, email, website, strasse, plz, ort, notizen")
    .eq("id", id)
    .is("archiviert_am", null)
    .maybeSingle();
  if (!k) notFound();

  const name = kontaktName(k);
  const anschrift = { strasse: k.strasse, plz: k.plz, ort: k.ort };
  const adresse = adresseText(anschrift);
  const zeilen = [
    { label: "Mobil", wert: k.mobil, link: telLink(k.mobil), icon: <PhoneIcon className="size-5 shrink-0 text-primary" /> },
    { label: "Telefon", wert: k.telefon, link: telLink(k.telefon), icon: <PhoneIcon className="size-5 shrink-0 text-primary" /> },
    { label: "E-Mail", wert: k.email, link: mailLink(k.email), icon: <MailIcon className="size-5 shrink-0 text-primary" /> },
  ].filter((z) => z.link);

  return (
    <div className="flex flex-col gap-4">
      <SeitenKopf titel={name} zurueck="/kontakte" />
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {k.typ === "firma" ? <BuildingIcon className="size-6" /> : <UserIcon className="size-6" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{name}</p>
          {k.kundennummer && <p className="text-sm text-muted-foreground">{k.kundennummer}</p>}
          {k.ansprechpartner && <p className="text-sm text-muted-foreground">Ansprechpartner: {k.ansprechpartner}</p>}
        </div>
      </div>

      {zeilen.length > 0 && (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {zeilen.map((z) => (
            <li key={z.label}>
              <a href={z.link!} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted">
                {z.icon}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-muted-foreground">{z.label}</span>
                  <span className="block truncate font-medium text-primary">{z.wert}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {adresse && <AdressKarte titel="Adresse" text={adresse} googleLink={mapsLink(anschrift) ?? "#"} appleLink={appleMapsLink(anschrift) ?? "#"} />}

      {k.notizen && (
        <section className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Notizen</p>
          <p className="whitespace-pre-line">{k.notizen}</p>
        </section>
      )}
    </div>
  );
}
