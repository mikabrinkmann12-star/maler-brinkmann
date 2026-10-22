import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PhoneIcon } from "lucide-react";
import { cn } from "cn";
import { requireBueroRecht } from "@/lib/auth";
import { STATUS_NAMEN, STATUS_WERTE, istKategorie, istStatus, type AnrufStatus } from "@/lib/anruf";
import { kontaktName } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";
import { AnrufEintragen } from "./anruf-eintragen";
import { AnrufKarte, type AnrufZeile } from "./anruf-karte";

export const metadata: Metadata = { title: "Anrufe" };

/** Anrufe wie bei Plancraft (KI-Telefon): Liste mit Zusammenfassung, Kategorie und Status. Die Anrufe schickt der Telefon-Dienst an /api/anrufe. */
export default async function AnrufeSeite({ searchParams }: { searchParams: Promise<{ status?: string; archiv?: string }> }) {
  const nutzer = await requireBueroRecht("buero_zugang");
  const sp = await searchParams;
  const archiv = sp.archiv === "1";
  const status: AnrufStatus | "alle" = istStatus(sp.status) ? sp.status : "alle";

  const supabase = await createClient();
  const { data } = await supabase
    .from("calls")
    .select("id, anbieter, richtung, von_nummer, beginn, dauer_sek, zusammenfassung, transkript, kategorie, status, notiz, archiviert_am, contacts(id, vorname, nachname, firmenname)")
    .order("beginn", { ascending: false })
    .limit(300);

  const alle = (data ?? []).filter((c) => (c.archiviert_am !== null) === archiv);
  const zahlen = Object.fromEntries(STATUS_WERTE.map((s) => [s, alle.filter((c) => c.status === s).length])) as Record<AnrufStatus, number>;
  const sichtbar = alle.filter((c) => status === "alle" || c.status === status);

  const zeilen: AnrufZeile[] = sichtbar.map((c) => ({
    id: c.id,
    richtung: c.richtung === "ausgehend" ? "ausgehend" : "eingehend",
    vonNummer: c.von_nummer,
    beginn: c.beginn,
    dauerSek: c.dauer_sek,
    zusammenfassung: c.zusammenfassung,
    transkript: c.transkript,
    kategorie: istKategorie(c.kategorie) ? c.kategorie : "sonstiges",
    status: istStatus(c.status) ? c.status : "neu",
    notiz: c.notiz ?? "",
    archiviert: c.archiviert_am !== null,
    anbieter: c.anbieter,
    kontakt: c.contacts ? { id: c.contacts.id, name: kontaktName(c.contacts) || "Kontakt" } : null,
  }));

  const adresse = (a: { status?: string; archiv?: string }) => {
    const p = new URLSearchParams();
    if (a.status) p.set("status", a.status);
    if (a.archiv) p.set("archiv", a.archiv);
    const s = p.toString();
    return s ? `/buero/anrufe?${s}` : "/buero/anrufe";
  };
  const reiter = [{ wert: "alle" as const, name: "Alle", n: alle.length }, ...STATUS_WERTE.map((s) => ({ wert: s, name: STATUS_NAMEN[s], n: zahlen[s] }))];

  const eingerichtet = Boolean(process.env.ANRUFE_WEBHOOK_SECRET);
  const kopf = await headers();
  const host = kopf.get("x-forwarded-host") ?? kopf.get("host") ?? "";
  const basis = host ? `${host.startsWith("localhost") || host.endsWith(".localhost") ? "http" : "https"}://${host}` : "";

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><PhoneIcon className="size-5" /> Anrufe</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Die KI nimmt Anrufe an und schreibt auf, worum es ging. Hier siehst du Zusammenfassung, Kategorie und Gesprächstext und markierst, was erledigt ist.
          </p>
        </div>
        <AnrufEintragen />
      </div>

      {nutzer.rolle === "admin" && !eingerichtet && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Noch kein Telefon-Dienst verbunden</p>
          <p className="mt-1">
            Damit Anrufe hier ankommen, muss ein Telefon-KI-Dienst nach jedem Anruf an <code>{basis}/api/anrufe</code> senden. Dazu in Vercel die Variable{" "}
            <code>ANRUFE_WEBHOOK_SECRET</code> (ein langes Zufallswort) setzen und es im Dienst als „Authorization: Bearer …“ eintragen. Der Dienst kostet Geld (Nummer plus Minutenpreis), das entscheidet Ralf. Bis dahin kannst du Anrufe oben von Hand eintragen. Beschreibung: <code>docs/ANRUFE.md</code>.
          </p>
        </section>
      )}

      <nav aria-label="Status" className="flex flex-wrap gap-2">
        {reiter.map((r) => (
          <Link
            key={r.wert}
            href={adresse({ status: r.wert === "alle" ? undefined : r.wert, archiv: archiv ? "1" : undefined })}
            aria-current={status === r.wert ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", status === r.wert ? "border-foreground bg-foreground text-background" : "bg-white hover:bg-muted")}
          >
            {r.name} <span className="tabular-nums opacity-70">{r.n}</span>
          </Link>
        ))}
        <Link href={adresse({ status: status === "alle" ? undefined : status, archiv: archiv ? undefined : "1" })} className="ml-auto rounded-full border bg-white px-3 py-1 text-sm hover:bg-muted">
          {archiv ? "Zurück zu den Anrufen" : "Archiv"}
        </Link>
      </nav>

      {zeilen.length === 0 ? (
        <p className="rounded-lg border bg-white px-4 py-6 text-center text-muted-foreground">
          {archiv ? "Das Archiv ist leer." : status === "alle" ? "Noch keine Anrufe." : "Keine Anrufe mit diesem Status."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-white">
          {zeilen.map((z) => <AnrufKarte key={z.id} anruf={z} />)}
        </ul>
      )}
    </div>
  );
}
