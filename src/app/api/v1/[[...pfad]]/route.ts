import { darf } from "@/lib/api-schluessel";
import { apiAnmelden, apiProtokollieren } from "@/lib/api/auth";
import { leseRouten } from "@/lib/api/lesen";
import { routeSuchen, routenKatalog } from "@/lib/api/router";
import { schreibRouten } from "@/lib/api/schreiben";
import { ApiFehler } from "@/lib/api/typen";
import { createAdminClient } from "@/lib/supabase/admin";

// Schnittstelle (API) für Programme wie „Jarvis“, Version 1. Anmeldung nur mit API-Schlüssel (Einstellungen → Schnittstelle).
// AUSNAHME von „Admin-Client nur nach requireRole(admin)“: Der Schlüssel wird von einem Admin angelegt und kann jederzeit widerrufen werden;
// jeder Aufruf prüft Schlüssel, Rechte (lesen/schreiben) und Admin-Status des Erstellers und läuft nur über die festen Endpunkte in src/lib/api/.
// Alles wird protokolliert (api_log). Diese Adresse ist vom Login der Seiten ausgenommen (proxy.ts).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROUTEN = [...leseRouten, ...schreibRouten];
const KOPF = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const MAX_KOERPER = 200_000;

function antwort(status: number, inhalt: unknown) {
  return Response.json(inhalt, { status, headers: KOPF });
}

async function behandeln(request: Request, ctx: { params: Promise<{ pfad?: string[] }> }, methode: "GET" | "POST") {
  const db = createAdminClient();
  const { pfad = [] } = await ctx.params;
  const pfadText = pfad.join("/");

  const anmeldung = await apiAnmelden(request, db);
  if (!anmeldung.ok) {
    await apiProtokollieren(db, anmeldung.schluesselId ?? null, methode, pfadText, anmeldung.status);
    return antwort(anmeldung.status, { fehler: anmeldung.fehler });
  }
  const { schluessel } = anmeldung;
  const fertig = async (status: number, inhalt: unknown) => {
    await apiProtokollieren(db, schluessel.id, methode, pfadText, status);
    return antwort(status, inhalt);
  };

  // Katalog aller Endpunkte (für Jarvis: welche „Werkzeuge“ gibt es)
  if (pfad.length === 0 && methode === "GET") {
    return fertig(200, { version: 1, rechte: schluessel.scopes, endpunkte: routenKatalog(ROUTEN).filter((r) => schluessel.scopes.includes(r.recht)) });
  }

  const treffer = routeSuchen(ROUTEN, methode, pfadText);
  if ("fehler" in treffer) {
    return treffer.fehler === "methode"
      ? fertig(405, { fehler: `Diese Adresse erlaubt nur: ${treffer.erlaubt.join(", ")}.` })
      : fertig(404, { fehler: "Diese Adresse gibt es nicht. GET /api/v1 zeigt alle Endpunkte." });
  }
  if (!darf(schluessel.scopes, treffer.route.scope)) {
    return fertig(403, { fehler: `Dieser Schlüssel hat nicht das Recht „${treffer.route.scope}“.` });
  }

  let body: unknown = null;
  if (methode === "POST") {
    const roh = await request.text();
    if (roh.length > MAX_KOERPER) return fertig(413, { fehler: "Die Anfrage ist zu groß." });
    if (roh.trim()) {
      try {
        body = JSON.parse(roh);
      } catch {
        return fertig(400, { fehler: "Der Körper ist kein gültiges JSON." });
      }
    }
  }

  try {
    const daten = await treffer.route.handler({
      db,
      nutzerId: schluessel.nutzerId,
      schluesselId: schluessel.id,
      params: treffer.params,
      query: new URL(request.url).searchParams,
      body,
    });
    return fertig(methode === "POST" ? 201 : 200, { daten });
  } catch (e) {
    if (e instanceof ApiFehler) return fertig(e.status, { fehler: e.message });
    console.error("[api] unerwarteter Fehler", e);
    return fertig(500, { fehler: "Es ist ein technischer Fehler aufgetreten." });
  }
}

export async function GET(request: Request, ctx: RouteContext<"/api/v1/[[...pfad]]">) {
  return behandeln(request, ctx, "GET");
}

export async function POST(request: Request, ctx: RouteContext<"/api/v1/[[...pfad]]">) {
  return behandeln(request, ctx, "POST");
}
