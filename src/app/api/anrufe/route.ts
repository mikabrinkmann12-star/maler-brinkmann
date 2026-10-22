import { anrufNormalisieren, geheimnisPasst } from "@/lib/anruf";
import { anrufSpeichern } from "@/lib/anruf-daten";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook des Telefon-KI-Dienstes: Er schickt nach jedem Anruf Zusammenfassung, Kategorie und Text (siehe src/lib/anruf.ts).
// Kein Login. Berechtigung ist das Geheimnis ANRUFE_WEBHOOK_SECRET: im Kopf „Authorization: Bearer <Geheimnis>“ oder „x-webhook-secret“,
// notfalls als Adresszusatz „?key=<Geheimnis>“ (für Dienste, die keine Köpfe setzen können). Ohne gesetztes Geheimnis tut die Adresse nichts.
// Ausnahme der Regel „Dienst-Client nur nach requireRole(admin)“: Die Adresse schreibt nur in `calls`, nur mit gültigem Geheimnis.

export const dynamic = "force-dynamic";

const KOPF = { "Cache-Control": "no-store" };
const MAX_BYTES = 300_000;

export async function POST(request: Request) {
  const geheimnis = process.env.ANRUFE_WEBHOOK_SECRET;
  if (!geheimnis) return Response.json({ fehler: "ANRUFE_WEBHOOK_SECRET ist nicht gesetzt." }, { status: 503, headers: KOPF });

  const auth = request.headers.get("authorization");
  const erhalten = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : (request.headers.get("x-webhook-secret") ?? new URL(request.url).searchParams.get("key"));
  if (!geheimnisPasst(erhalten, geheimnis)) return Response.json({ fehler: "Nicht erlaubt." }, { status: 401, headers: KOPF });

  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ fehler: "Der Inhalt ist zu groß." }, { status: 413, headers: KOPF });
  let inhalt: unknown;
  try {
    inhalt = JSON.parse(text);
  } catch {
    return Response.json({ fehler: "Kein gültiges JSON." }, { status: 400, headers: KOPF });
  }

  const n = anrufNormalisieren(inhalt);
  // Ereignisse, die wir nicht brauchen (z. B. „Anruf gestartet“), bestätigen wir ohne Eintrag, damit der Dienst nicht wiederholt
  if (!n.ok) return Response.json({ ok: false, hinweis: n.fehler }, { status: n.fehler.startsWith("Ereignis") ? 200 : 422, headers: KOPF });

  try {
    const r = await anrufSpeichern(createAdminClient(), n.anruf);
    return Response.json({ ok: true, id: r.id, doppelt: r.doppelt }, { headers: KOPF });
  } catch (e) {
    console.error("[anrufe] speichern fehlgeschlagen:", e instanceof Error ? e.message : e);
    return Response.json({ fehler: "Speichern fehlgeschlagen." }, { status: 500, headers: KOPF });
  }
}
