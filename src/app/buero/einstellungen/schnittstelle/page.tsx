import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { formatDatumZeit } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SchluesselAnlegen, Widerrufen } from "./schluessel-verwaltung";

export const metadata: Metadata = { title: "Schnittstelle (API)" };

export default async function SchnittstellenSeite() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: schluessel }, { data: log }] = await Promise.all([
    supabase.from("api_keys").select("id, name, prefix, scopes, created_at, last_used_at, revoked_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("api_log").select("methode, pfad, status, created_at, api_keys(name)").order("created_at", { ascending: false }).limit(15),
  ]);
  const basis = process.env.NEXT_PUBLIC_APP_URL ?? "https://maler-brinkmann-23nr.vercel.app";

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Schnittstelle (API)</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Mit einem API-Schlüssel kann ein Programm wie „Jarvis“ die App bedienen: Daten lesen und Entwürfe anlegen. Es kann nichts versenden (keine Angebots-Mails, keine Übertragung an die Buchhaltung) und nichts löschen. Neu angelegte Einträge stehen in deinem Namen.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-4 text-[13px]">
        <p className="font-medium">So sprichst du die Schnittstelle an</p>
        <p className="mt-1 text-muted-foreground">Alle Adressen beginnen mit</p>
        <code className="mt-1 block rounded bg-muted px-2 py-1.5">{basis}/api/v1</code>
        <p className="mt-2 text-muted-foreground">und brauchen die Kopfzeile <code>Authorization: Bearer &lt;dein Schlüssel&gt;</code>. Die Liste aller Endpunkte liefert <code>GET /api/v1</code>. Die ausführliche Beschreibung steht in <code>docs/API.md</code>.</p>
      </section>

      <SchluesselAnlegen />

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Schlüssel</h2>
        {(schluessel ?? []).length === 0 && <p className="text-[13px] text-muted-foreground">Noch kein Schlüssel.</p>}
        <ul className="flex flex-col divide-y rounded-lg border bg-white">
          {(schluessel ?? []).map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-medium">{k.name} <code className="ml-1 text-xs text-muted-foreground">{k.prefix}…</code></p>
                <p className="text-xs text-muted-foreground">
                  Rechte: {k.scopes.join(", ")} · angelegt {formatDatumZeit(k.created_at)} · {k.last_used_at ? `zuletzt benutzt ${formatDatumZeit(k.last_used_at)}` : "noch nie benutzt"}
                </p>
              </div>
              {k.revoked_at ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">widerrufen</span> : <Widerrufen id={k.id} name={k.name} />}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Letzte Aufrufe</h2>
        {(log ?? []).length === 0 && <p className="text-[13px] text-muted-foreground">Noch keine Aufrufe.</p>}
        <ul className="flex flex-col divide-y rounded-lg border bg-white text-[13px]">
          {(log ?? []).map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="min-w-0 truncate"><code>{l.methode} /{l.pfad}</code> <span className="text-muted-foreground">· {l.api_keys?.name ?? "unbekannter Schlüssel"}</span></span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className={l.status >= 400 ? "font-medium text-destructive" : ""}>{l.status}</span>
                {formatDatumZeit(l.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
