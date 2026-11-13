import { NextResponse } from "next/server";
import { antwortMoeglich, antwortSchema } from "@/lib/angebot-antwort";
import { antwortLaden, antwortSpeichern, freigabeFinden } from "@/lib/angebot-freigabe-daten";
import { heuteIso } from "@/lib/datum";
import { createAdminClient } from "@/lib/supabase/admin";

// Kunde nimmt das Angebot in der Online-Ansicht an oder lehnt es ab. Kein Login: Der Schlüssel im Link ist die Berechtigung
// (wie bei /gesehen und /pdf). Der Dienst-Client wird nur für das Angebot benutzt, auf das der Schlüssel zeigt.

export const dynamic = "force-dynamic";

const antwort = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(anfrage: Request, { params }: RouteContext<"/angebot/[token]/antwort">) {
  const { token } = await params;
  const db = createAdminClient();
  const freigabe = await freigabeFinden(db, token);
  if (!freigabe) return antwort({ fehler: "Dieser Link ist nicht mehr gültig." }, 404);

  let roh: unknown;
  try {
    roh = await anfrage.json();
  } catch {
    return antwort({ fehler: "Ungültige Anfrage." }, 400);
  }
  const p = antwortSchema.safeParse(roh);
  if (!p.success) return antwort({ fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." }, 400);

  const { data: q } = await db.from("quotes").select("status, gueltig_bis, archiviert_am").eq("id", freigabe.quoteId).maybeSingle();
  if (!q || q.archiviert_am) return antwort({ fehler: "Dieser Link ist nicht mehr gültig." }, 404);
  const moeglich = antwortMoeglich({ status: q.status, gueltigBis: q.gueltig_bis, schonGeantwortet: Boolean(await antwortLaden(db, freigabe.quoteId)) }, heuteIso());
  if (!moeglich.ok) return antwort({ fehler: moeglich.grund }, 409);

  const e = p.data;
  const r = await antwortSpeichern(db, freigabe, { antwort: e.antwort, name: e.name, grund: e.antwort === "abgelehnt" ? e.grund : undefined });
  if ("fehler" in r) return antwort({ fehler: r.fehler }, 409);
  return antwort({ ok: true });
}
