import type { Metadata } from "next";
import Link from "next/link";
import { MailIcon } from "lucide-react";
import { cn } from "cn";
import { darf, requireBueroRecht } from "@/lib/auth";
import {
  ANFRAGE_STATUS,
  ANFRAGE_STATUS_NAMEN,
  DUBLETTEN_GRUND_TEXT,
  dublettenFinden,
  istAnfrageStatus,
  kontaktVorschlag,
  type AnfrageStatus,
  type KontaktFuerDublette,
} from "@/lib/anfrage";
import { kontaktName } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";
import { AnfrageKarte, type AnfrageZeile } from "./anfrage-karte";

export const metadata: Metadata = { title: "Anfragen" };

/** Website-Anfragen: Das Kontaktformular der Website schickt jede Anfrage an /api/anfragen. Hier annehmen (→ Kontakt) oder ablehnen. */
export default async function AnfragenSeite({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const nutzer = await requireBueroRecht("buero_zugang");
  const sp = await searchParams;
  const status: AnfrageStatus = istAnfrageStatus(sp.status) ? sp.status : "neu";

  const supabase = await createClient();
  const [{ data }, darfAnlegen] = await Promise.all([
    supabase
      .from("website_anfragen")
      .select("id, name, vorname, nachname, telefon, email, betreff, nachricht, strasse, plz, ort, quelle, status, notiz, created_at, contacts(id, vorname, nachname, firmenname)")
      .is("archiviert_am", null)
      .order("created_at", { ascending: false })
      .limit(500),
    darf("kontakte_bearbeiten"),
  ]);

  const alle = data ?? [];
  const zahlen = Object.fromEntries(ANFRAGE_STATUS.map((s) => [s, alle.filter((a) => a.status === s).length])) as Record<AnfrageStatus, number>;
  const sichtbar = alle.filter((a) => a.status === status);

  // Kontakte für die Dubletten-Prüfung nur laden, wenn hier etwas angenommen werden kann
  let kontakte: (KontaktFuerDublette & { kundennummer: string | null })[] = [];
  if (status !== "angenommen" && sichtbar.length) {
    const { data: k } = await supabase
      .from("contacts")
      .select("id, firmenname, vorname, nachname, strasse, plz, telefon, mobil, email, kundennummer")
      .is("archiviert_am", null)
      .limit(5000);
    kontakte = k ?? [];
  }
  const kontaktNach = new Map(kontakte.map((k) => [k.id, k]));

  const zeilen: AnfrageZeile[] = sichtbar.map((a) => {
    const vorschlag = kontaktVorschlag(a);
    const dubletten = status === "angenommen" ? [] : dublettenFinden(vorschlag, kontakte);
    return {
      id: a.id,
      name: a.name,
      telefon: a.telefon,
      email: a.email,
      betreff: a.betreff,
      nachricht: a.nachricht,
      strasse: a.strasse,
      plz: a.plz,
      ort: a.ort,
      quelle: a.quelle,
      status: istAnfrageStatus(a.status) ? a.status : "neu",
      notiz: a.notiz ?? "",
      eingang: a.created_at,
      kontakt: a.contacts ? { id: a.contacts.id, name: kontaktName(a.contacts) || "Kontakt" } : null,
      vorschlag,
      dubletten: dubletten.map((d) => {
        const k = kontaktNach.get(d.id);
        const name = (k && kontaktName(k)) || "Kontakt";
        return { id: d.id, name: k?.kundennummer ? `${name} (${k.kundennummer})` : name, grund: d.gruende.map((g) => DUBLETTEN_GRUND_TEXT[g]).join(", ") };
      }),
    };
  });

  const eingerichtet = Boolean(process.env.ANFRAGEN_WEBHOOK_SECRET);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><MailIcon className="size-5" /> Anfragen</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Anfragen aus dem Kontaktformular der Website. Annehmen legt einen Kontakt an (oder verknüpft einen vorhandenen), Ablehnen ändert nur den Status.
        </p>
      </div>

      {nutzer.rolle === "admin" && !eingerichtet && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Website noch nicht verbunden</p>
          <p className="mt-1">
            Damit Anfragen hier ankommen, in Vercel die Variable <code>ANFRAGEN_WEBHOOK_SECRET</code> (ein langes Zufallswort) setzen und dasselbe
            Wort auf Strato in <code>anfragen-config.php</code> eintragen. Beschreibung: <code>docs/wissen/phase-3-buero.md</code> (Website-Anfragen).
          </p>
        </section>
      )}

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {ANFRAGE_STATUS.map((s) => (
          <Link
            key={s}
            href={s === "neu" ? "/buero/anfragen" : `/buero/anfragen?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", status === s ? "border-foreground bg-foreground text-background" : "bg-white hover:bg-muted")}
          >
            {ANFRAGE_STATUS_NAMEN[s]} <span className="tabular-nums opacity-70">{zahlen[s]}</span>
          </Link>
        ))}
      </nav>

      {zeilen.length === 0 ? (
        <p className="rounded-lg border bg-white px-4 py-6 text-center text-muted-foreground">
          {status === "neu" ? "Keine neuen Anfragen." : `Keine ${ANFRAGE_STATUS_NAMEN[status].toLowerCase()}en Anfragen.`}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-white">
          {zeilen.map((z) => <AnfrageKarte key={z.id} anfrage={z} darfAnlegen={darfAnlegen} />)}
        </ul>
      )}
    </div>
  );
}
