import type { Metadata } from "next";
import Link from "next/link";
import { BotIcon, CheckIcon, MicIcon, PhoneIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { requireRole } from "@/lib/auth";
import { formatDatumZeit } from "@/lib/format";
import { abfragenZaehlen, aktionLesen, istSchreibend } from "@/lib/ki-system";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "KI-System" };

const DARF = [
  "Alles lesen: Projekte, Kontakte, Zeiten, Einteilung, Angebote, Rechnungen, Eingangsrechnungen, Urlaub, Container, Katalog, Termine",
  "Container melden und als erledigt markieren (z. B. nach der Bestellung bei der Containerfirma)",
  "Zeiten, Notizen, Kontakte und Projekte anlegen",
  "Angebote als Entwurf anlegen, Positionen anhängen, Status auf angenommen/abgelehnt/Entwurf setzen",
  "Einen Rechnungsentwurf aus einem Angebot anlegen",
];
const DARF_NICHT = [
  "Nichts versenden: keine Angebots-Mails, keine Übertragung an die Buchhaltung, keine Rechnung abschicken",
  "Nichts löschen",
  "Keine Einstellungen, Nutzer oder Rechte ändern",
];

/**
 * KI-System: Platz für „Jarvis“. Hier steht, was Jarvis in der App getan hat (Protokoll der Schnittstelle), was er darf und was noch fehlt.
 * Nur für den Admin (das Protokoll und die Schlüssel sind Admin-Sache). Jarvis selbst (Sprache, Telefon) ist noch nicht gebaut.
 */
export default async function KiSystemSeite() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: schluessel }, { data: log }] = await Promise.all([
    supabase.from("api_keys").select("id, name, scopes, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("api_log").select("methode, pfad, status, created_at, api_keys(name)").order("created_at", { ascending: false }).limit(300),
  ]);

  const aktive = (schluessel ?? []).filter((k) => !k.revoked_at);
  const zuletzt = aktive.map((k) => k.last_used_at).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const eintraege = log ?? [];
  const aktionen = eintraege.filter((e) => istSchreibend(e.methode));
  const abfragen = abfragenZaehlen(eintraege);
  const box = "rounded-lg border bg-white p-4";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><BotIcon className="size-5" /> KI-System</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Hier landet alles, was „Jarvis“ in der App erledigt. Jarvis arbeitet über die Schnittstelle (API) mit einem Schlüssel, den du unter{" "}
          <Link href="/buero/einstellungen/schnittstelle" className="underline">Einstellungen → Schnittstelle</Link> anlegst.
        </p>
      </div>

      <section className={cn(box, "flex flex-wrap items-center gap-x-8 gap-y-3")} aria-label="Stand">
        <div>
          <p className="text-xs text-muted-foreground">Verbindung</p>
          <p className="flex items-center gap-1.5 font-medium">
            {zuletzt ? <><span className="size-2 rounded-full bg-green-500" /> Zuletzt aktiv {formatDatumZeit(zuletzt)}</> : aktive.length ? <><span className="size-2 rounded-full bg-amber-500" /> Schlüssel da, noch nie benutzt</> : <><span className="size-2 rounded-full bg-muted-foreground/40" /> Noch nicht verbunden</>}
          </p>
        </div>
        <div><p className="text-xs text-muted-foreground">Aktive Schlüssel</p><p className="font-medium tabular-nums">{aktive.length}</p></div>
        <div><p className="text-xs text-muted-foreground">Änderungen (letzte 300 Aufrufe)</p><p className="font-medium tabular-nums">{aktionen.length}</p></div>
        <div><p className="text-xs text-muted-foreground">Abfragen</p><p className="font-medium tabular-nums">{eintraege.length - aktionen.length}</p></div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Was Jarvis getan hat">
        <h2 className="text-[15px] font-semibold">Was Jarvis getan hat</h2>
        {aktionen.length === 0 ? (
          <p className={cn(box, "text-[13px] text-muted-foreground")}>Noch nichts. Sobald Jarvis etwas anlegt oder meldet (Container, Zeiten, Angebotsentwürfe …), steht es hier mit Zeitpunkt.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-white text-[13px]">
            {aktionen.slice(0, 100).map((e, i) => {
              const a = aktionLesen(e.methode, e.pfad, e.status);
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {a.ok ? <CheckIcon className="size-4 shrink-0 text-green-600" /> : <XIcon className="size-4 shrink-0 text-destructive" />}
                    <span className={cn("truncate", !a.ok && "text-destructive")}>{a.text}{!a.ok && ` (fehlgeschlagen, Status ${e.status})`}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{e.api_keys?.name ?? "unbekannter Schlüssel"} · {formatDatumZeit(e.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Das Protokoll kennt nur Zeitpunkt, Art und Ergebnis. Was genau eingetragen wurde, steht im jeweiligen Datensatz (z. B. in den Zeiten oder der Container-Liste), neue Einträge stehen im Namen des Admins, der den Schlüssel angelegt hat.</p>
      </section>

      {abfragen.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Abfragen">
          <h2 className="text-[15px] font-semibold">Abfragen</h2>
          <ul className="flex flex-col divide-y rounded-lg border bg-white text-[13px]">
            {abfragen.map((a) => (
              <li key={a.text} className="flex items-center justify-between gap-2 px-4 py-2"><span>{a.text}</span><span className="tabular-nums text-muted-foreground">{a.anzahl}×</span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className={box} aria-label="Was Jarvis darf">
          <h2 className="text-[15px] font-semibold">Was Jarvis darf</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {DARF.map((t) => <li key={t} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0 text-green-600" />{t}</li>)}
          </ul>
          <h2 className="mt-4 text-[15px] font-semibold">Was er nicht darf</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
            {DARF_NICHT.map((t) => <li key={t} className="flex gap-2"><XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />{t}</li>)}
          </ul>
        </section>
        <section className={box} aria-label="Noch nicht gebaut">
          <h2 className="text-[15px] font-semibold">Noch nicht eingerichtet</h2>
          <ul className="mt-2 flex flex-col gap-2 text-[13px]">
            <li className="flex gap-2"><MicIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="font-medium">Sprache:</span> Jarvis versteht gesprochene Anweisungen. Braucht einen KI-Dienst (kostet pro Nutzung), das entscheidet Ralf.</span></li>
            <li className="flex gap-2"><PhoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="font-medium">Telefon:</span> Anrufe annehmen, Containerfirma anrufen und die Bestellung eintragen. Braucht eine Telefonnummer (kostet monatlich).</span></li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Der Plan steht in <code>docs/JARVIS-PROMPT.md</code>. Sobald Jarvis gebaut ist, erscheinen seine Anrufe und Gespräche hier unter Aktivität.</p>
        </section>
      </div>
    </div>
  );
}
