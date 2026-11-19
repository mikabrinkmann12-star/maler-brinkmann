import { anfrageNormalisieren } from "@/lib/anfrage";
import { anfrageSpeichern } from "@/lib/anfrage-daten";
import { geheimnisPasst } from "@/lib/anruf";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook für das Kontaktformular der Website: anfrage.php (Strato) leitet jede Anfrage hierher weiter (Felder siehe src/lib/anfrage.ts).
// Kein Login. Berechtigung ist das Geheimnis ANFRAGEN_WEBHOOK_SECRET im Kopf „x-webhook-secret“ (oder „Authorization: Bearer …“).
// Bewusst NICHT als Adresszusatz (?key=), damit das Geheimnis nicht in Protokollen landet. Ohne gesetztes Geheimnis tut die Adresse nichts.
// Ausnahme der Regel „Dienst-Client nur nach requireRole(admin)“: Die Adresse schreibt nur in `website_anfragen`, nur mit gültigem Geheimnis.

export const dynamic = "force-dynamic";

const KOPF = { "Cache-Control": "no-store" };
const MAX_BYTES = 50_000;

export async function POST(request: Request) {
  const geheimnis = process.env.ANFRAGEN_WEBHOOK_SECRET;
  if (!geheimnis) return Response.json({ fehler: "ANFRAGEN_WEBHOOK_SECRET ist nicht gesetzt." }, { status: 503, headers: KOPF });

  const auth = request.headers.get("authorization");
  const erhalten = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : request.headers.get("x-webhook-secret");
  if (!geheimnisPasst(erhalten, geheimnis)) return Response.json({ fehler: "Nicht erlaubt." }, { status: 401, headers: KOPF });

  // Erst die angegebene Größe prüfen (spart das Lesen), dann die tatsächliche
  const angegeben = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(angegeben) && angegeben > MAX_BYTES) return Response.json({ fehler: "Der Inhalt ist zu groß." }, { status: 413, headers: KOPF });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BYTES) return Response.json({ fehler: "Der Inhalt ist zu groß." }, { status: 413, headers: KOPF });

  let inhalt: unknown;
  try {
    inhalt = JSON.parse(text);
  } catch {
    return Response.json({ fehler: "Kein gültiges JSON." }, { status: 400, headers: KOPF });
  }

  const n = anfrageNormalisieren(inhalt);
  if (!n.ok) return Response.json({ ok: false, fehler: n.fehler }, { status: 422, headers: KOPF });

  try {
    const r = await anfrageSpeichern(createAdminClient(), n.anfrage);
    return Response.json({ ok: true, id: r.id, doppelt: r.doppelt }, { headers: KOPF });
  } catch (e) {
    console.error("[anfragen] speichern fehlgeschlagen:", e instanceof Error ? e.message : e);
    return Response.json({ fehler: "Speichern fehlgeschlagen." }, { status: 500, headers: KOPF });
  }
}
