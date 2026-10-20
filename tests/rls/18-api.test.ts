// API für Programme wie Jarvis: Schlüssel (nur Hash gespeichert, widerrufbar, Rechte lesen/schreiben), feste Endpunkte, Entwürfe ja,
// Versenden/Löschen nein. Die Handler der Route werden direkt aufgerufen (kein laufender Server nötig).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/[[...pfad]]/route";
import { schluesselErzeugen } from "@/lib/api-schluessel";
import { adminClient, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let admin: TestNutzer, maler: TestNutzer;
let leseKey = "", schreibKey = "", widerrufKey = "";
const schluesselIds: string[] = [];
let vorhandeneAktive: string[] = [];
const angelegt = { projekte: [] as string[], kontakte: [] as string[], angebote: [] as string[], rechnungen: [] as string[], container: [] as string[] };

async function aufruf(methode: "GET" | "POST", pfad: string, schluessel: string | null, body?: unknown) {
  const kopf: Record<string, string> = { "content-type": "application/json" };
  if (schluessel) kopf.authorization = `Bearer ${schluessel}`;
  const [p, q] = pfad.split("?");
  const request = new Request(`http://localhost/api/v1/${p}${q ? `?${q}` : ""}`, { method: methode, headers: kopf, body: body === undefined ? undefined : JSON.stringify(body) });
  const ctx = { params: Promise.resolve({ pfad: p.split("/").filter(Boolean) }) } as never;
  const r = await (methode === "GET" ? GET(request, ctx) : POST(request, ctx));
  return { status: r.status, json: (await r.json()) as { daten?: any; fehler?: string; endpunkte?: { pfad: string }[]; rechte?: string[] } };
}

async function schluesselAnlegen(scopes: string[], widerrufen = false): Promise<string> {
  const s = schluesselErzeugen();
  const { data, error } = await adminClient()
    .from("api_keys")
    .insert({ name: `TEST ${scopes.join("+")}`, key_hash: s.hash, prefix: s.prefix, scopes, created_by: admin.id, revoked_at: widerrufen ? new Date().toISOString() : null })
    .select("id")
    .single();
  expect(error).toBeNull();
  schluesselIds.push(data!.id);
  return s.klartext;
}

beforeAll(async () => {
  const x = adminClient();
  const { data } = await x.from("container_requests").select("id").is("freigegeben_am", null);
  vorhandeneAktive = (data ?? []).map((r) => r.id);
  if (vorhandeneAktive.length) await x.from("container_requests").update({ freigegeben_am: new Date().toISOString() }).in("id", vorhandeneAktive);
  [admin, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("mitarbeiter")]);
  leseKey = await schluesselAnlegen(["lesen"]);
  schreibKey = await schluesselAnlegen(["lesen", "schreiben"]);
  widerrufKey = await schluesselAnlegen(["lesen"], true);
});

afterAll(async () => {
  const x = adminClient();
  const ids = angelegt;
  if (ids.rechnungen.length) {
    await x.from("invoice_items").delete().in("invoice_id", ids.rechnungen);
    await x.from("invoices").delete().in("id", ids.rechnungen);
  }
  if (ids.angebote.length) {
    await x.from("quote_items").delete().in("quote_id", ids.angebote);
    await x.from("quotes").delete().in("id", ids.angebote);
  }
  if (ids.projekte.length) {
    await x.from("project_notes").delete().in("project_id", ids.projekte);
    await x.from("time_entries").delete().in("project_id", ids.projekte);
    await x.from("projects").delete().in("id", ids.projekte);
  }
  await x.from("time_entries").delete().eq("user_id", maler.id);
  if (ids.kontakte.length) await x.from("contacts").delete().in("id", ids.kontakte);
  await x.from("container_requests").delete().eq("ausgeloest_von", admin.id);
  await x.from("notifications").delete().eq("ausgeloest_von", admin.id);
  if (vorhandeneAktive.length) await x.from("container_requests").update({ freigegeben_am: null, freigegeben_von: null }).in("id", vorhandeneAktive);
  if (schluesselIds.length) {
    await x.from("api_log").delete().in("key_id", schluesselIds);
    await x.from("api_keys").delete().in("id", schluesselIds);
  }
  await x.from("api_log").delete().is("key_id", null).lt("created_at", new Date(Date.now() + 1000).toISOString()).like("pfad", "uebersicht%");
  await Promise.all([admin, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Anmeldung", () => {
  it("ohne, mit falschem und mit widerrufenem Schlüssel: 401", async () => {
    expect((await aufruf("GET", "uebersicht", null)).status).toBe(401);
    expect((await aufruf("GET", "uebersicht", "mbk_abc")).status).toBe(401);
    expect((await aufruf("GET", "uebersicht", `mbk_${"0".repeat(48)}`)).status).toBe(401);
    const w = await aufruf("GET", "uebersicht", widerrufKey);
    expect(w.status).toBe(401);
    expect(w.json.fehler).toContain("widerrufen");
  });

  it("in der Datenbank steht nur der Hash, nicht der Schlüssel", async () => {
    const { data } = await adminClient().from("api_keys").select("key_hash, prefix").in("id", schluesselIds);
    for (const k of data ?? []) {
      expect(k.key_hash).toMatch(/^[0-9a-f]{64}$/);
      expect([leseKey, schreibKey].some((s) => s === k.key_hash)).toBe(false);
    }
  });

  it("der Katalog zeigt nur Endpunkte, die der Schlüssel darf", async () => {
    const lese = await aufruf("GET", "", leseKey);
    expect(lese.status).toBe(200);
    expect(lese.json.rechte).toEqual(["lesen"]);
    expect(lese.json.endpunkte!.some((e) => e.pfad === "/api/v1/projekte")).toBe(true);
    const alle = await aufruf("GET", "", schreibKey);
    expect(alle.json.endpunkte!.length).toBeGreaterThan(lese.json.endpunkte!.length);
  });

  it("nur ein aktiver Admin als Ersteller zählt", async () => {
    const x = adminClient();
    const schluessel = await schluesselAnlegen(["lesen"]);
    await x.from("profiles").update({ aktiv: false }).eq("id", admin.id);
    const r = await aufruf("GET", "uebersicht", schluessel);
    await x.from("profiles").update({ aktiv: true }).eq("id", admin.id);
    expect(r.status).toBe(403);
  });

  it("Aufrufe werden protokolliert", async () => {
    await aufruf("GET", "uebersicht", leseKey);
    const { data } = await adminClient().from("api_log").select("id").in("key_id", schluesselIds);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe("Lesen", () => {
  it("Übersicht, Projekte, Kontakte, Mitarbeiter, Zeiten, Einteilung, Angebote, Rechnungen, Eingangsrechnungen, Urlaub, Container, Katalog, Termine", async () => {
    for (const pfad of ["uebersicht", "projekte", "kontakte", "mitarbeiter", "zeiten", "einteilung", "angebote", "rechnungen", "eingangsrechnungen", "urlaub", "container", "katalog", "katalog?art=material", "termine"]) {
      const r = await aufruf("GET", pfad, leseKey);
      expect(r.status, `${pfad}: ${r.json.fehler ?? ""}`).toBe(200);
      expect(r.json.daten).toBeDefined();
    }
  });

  it("falsche Parameter geben verständliche Fehler", async () => {
    expect((await aufruf("GET", "zeiten?von=gestern", leseKey)).status).toBe(400);
    expect((await aufruf("GET", "projekte/abc", leseKey)).status).toBe(400);
    expect((await aufruf("GET", "angebote?status=quatsch", leseKey)).status).toBe(400);
    expect((await aufruf("GET", "gibtsnicht", leseKey)).status).toBe(404);
  });

  it("der Lese-Schlüssel darf nicht schreiben", async () => {
    const r = await aufruf("POST", "container", leseKey, { art: "papier" });
    expect(r.status).toBe(403);
  });
});

describe("Schreiben", () => {
  it("Container melden: einmal ja, dann 7 Tage gesperrt (409), erledigt markieren", async () => {
    const a = await aufruf("POST", "container", schreibKey, { art: "papier" });
    expect(a.status).toBe(201);
    angelegt.container.push(a.json.daten.id);
    const b = await aufruf("POST", "container", schreibKey, { art: "papier" });
    expect(b.status).toBe(409);
    expect(b.json.fehler).toContain("schon gemeldet");
    expect((await aufruf("POST", "container", schreibKey, { art: "sperrmuell" })).status).toBe(400);
    const e = await aufruf("POST", `container/${a.json.daten.id}/erledigt`, schreibKey, { notiz: "bestellt" });
    expect(e.status).toBe(201);
    const stand = await aufruf("GET", "container", leseKey);
    expect(stand.json.daten.status.find((s: { art: string }) => s.art === "papier").gesperrt).toBe(true);
    expect(stand.json.daten.status.find((s: { art: string }) => s.art === "restmuell").gesperrt).toBe(false);
  });

  let kontaktId = "", projektId = "", angebotId = "";

  it("Kontakt und Projekt anlegen (Nummern vergibt die App)", async () => {
    const k = await aufruf("POST", "kontakte", schreibKey, { typ: "privat", vorname: "Anna", nachname: "Apitest", strasse: "Testweg 1", plz: "26683", ort: "Saterland", email: "anna@example.com" });
    expect(k.status, k.json.fehler).toBe(201);
    expect(k.json.daten.kundennummer).toMatch(/^KD-\d{5,}$/);
    kontaktId = k.json.daten.id;
    angelegt.kontakte.push(kontaktId);
    expect((await aufruf("POST", "kontakte", schreibKey, { typ: "firma" })).status).toBe(400);
    expect((await aufruf("POST", "kontakte", schreibKey, { nachname: "X", email: "keine-mail" })).status).toBe(400);

    const p = await aufruf("POST", "projekte", schreibKey, { name: "API-Testprojekt", kunde_id: kontaktId, strasse: "Testweg 1", plz: "26683", ort: "Saterland", beschreibung: "angelegt vom Test" });
    expect(p.status, p.json.fehler).toBe(201);
    expect(p.json.daten.projektnummer).toMatch(/^P-\(2400\)\d{3,}$/);
    projektId = p.json.daten.id;
    angelegt.projekte.push(projektId);
    expect((await aufruf("POST", "projekte", schreibKey, { name: "" })).status).toBe(400);

    const gelesen = await aufruf("GET", `projekte/${projektId}`, leseKey);
    expect(gelesen.json.daten.kunde.name).toContain("Apitest");
  });

  it("Notiz und Zeit eintragen (Überschneidung wird abgelehnt)", async () => {
    const n = await aufruf("POST", "notizen", schreibKey, { projekt_id: projektId, text: "Notiz vom Test" });
    expect(n.status, n.json.fehler).toBe(201);
    const z = { person_id: maler.id, datum: "2027-03-02", art: "arbeitszeit", projekt_id: projektId, von: "06:30", bis: "15:45", pause_min: 45 };
    const a = await aufruf("POST", "zeiten", schreibKey, z);
    expect(a.status, a.json.fehler).toBe(201);
    expect(a.json.daten.stunden).toBe(8.5);
    const b = await aufruf("POST", "zeiten", schreibKey, { ...z, von: "07:00", bis: "10:00", pause_min: 0 });
    expect(b.status).toBe(409);
    expect((await aufruf("POST", "zeiten", schreibKey, { ...z, person_id: randomUUID() })).status).toBe(404);
    expect((await aufruf("POST", "zeiten", schreibKey, { ...z, art: "arbeitszeit", projekt_id: null, datum: "2027-03-03" })).status).toBe(400);
    const nurStunden = await aufruf("POST", "zeiten", schreibKey, { person_id: maler.id, datum: "2027-03-04", art: "krank", stunden: 8 });
    expect(nurStunden.status, nurStunden.json.fehler).toBe(201);
  });

  it("Angebot als Entwurf mit Positionen, Status annehmen, Rechnungsentwurf – aber nichts wird versendet", async () => {
    const a = await aufruf("POST", "angebote", schreibKey, {
      projekt_id: projektId,
      betreff: "API-Angebot",
      positionen: [
        { kurztext: "Wände streichen", menge: 120, einheit: "m²", einzelpreis: 8.5 },
        { kurztext: "Decke streichen", langtext: "zweimal", menge: 40.5, einheit: "m²", einzelpreis: 9 },
      ],
    });
    expect(a.status, a.json.fehler).toBe(201);
    expect(a.json.daten.status).toBe("entwurf");
    angebotId = a.json.daten.id;
    angelegt.angebote.push(angebotId);

    const items = await adminClient().from("quote_items").select("kurztext, menge, einzelpreis, sortierung").eq("quote_id", angebotId).order("sortierung");
    expect(items.data).toHaveLength(2);
    expect(Number(items.data![0].einzelpreis)).toBe(8.5);

    // Rechnung aus einem Entwurf geht nicht
    expect((await aufruf("POST", "rechnungen", schreibKey, { angebot_id: angebotId })).status).toBe(409);
    // „versendet“ gibt es über die API nicht
    expect((await aufruf("POST", `angebote/${angebotId}/status`, schreibKey, { status: "versendet" })).status).toBe(400);
    expect((await aufruf("POST", `angebote/${angebotId}/status`, schreibKey, { status: "angenommen" })).status).toBe(201);
    // Angenommene Angebote sind gesperrt: keine weiteren Positionen
    const gesperrt = await aufruf("POST", `angebote/${angebotId}/positionen`, schreibKey, { positionen: [{ kurztext: "x", menge: 1, einheit: "Stk", einzelpreis: 1 }] });
    expect(gesperrt.status).toBe(409);

    const r = await aufruf("POST", "rechnungen", schreibKey, { angebot_id: angebotId });
    expect(r.status, r.json.fehler).toBe(201);
    expect(r.json.daten.status).toBe("entwurf");
    angelegt.rechnungen.push(r.json.daten.id);
    const rechnung = await adminClient().from("invoices").select("status, rechnungsnummer, lexware_id").eq("id", r.json.daten.id).single();
    expect(rechnung.data).toMatchObject({ status: "entwurf", rechnungsnummer: null, lexware_id: null });
    // Zweiter Aufruf legt keine zweite Rechnung an
    const nochmal = await aufruf("POST", "rechnungen", schreibKey, { angebot_id: angebotId });
    expect(nochmal.json.daten.id).toBe(r.json.daten.id);
  });

  it("Positionen lassen sich im Entwurf anhängen, ungültige werden abgelehnt", async () => {
    const a = await aufruf("POST", "angebote", schreibKey, { projekt_id: projektId, betreff: "Zweites" });
    expect(a.status).toBe(201);
    angelegt.angebote.push(a.json.daten.id);
    const ok = await aufruf("POST", `angebote/${a.json.daten.id}/positionen`, schreibKey, { positionen: [{ kurztext: "Fenster lackieren", menge: 3, einheit: "Stk", einzelpreis: 120 }] });
    expect(ok.status, ok.json.fehler).toBe(201);
    const schlecht = await aufruf("POST", `angebote/${a.json.daten.id}/positionen`, schreibKey, { positionen: [{ kurztext: "", menge: -1, einheit: "Stk", einzelpreis: 1 }] });
    expect(schlecht.status).toBe(400);
    expect((await aufruf("POST", "angebote", schreibKey, { projekt_id: randomUUID(), betreff: "X" })).status).toBe(400);
  });

  it("kaputtes JSON gibt 400", async () => {
    const request = new Request("http://localhost/api/v1/notizen", { method: "POST", headers: { authorization: `Bearer ${schreibKey}` }, body: "{kaputt" });
    const r = await POST(request, { params: Promise.resolve({ pfad: ["notizen"] }) } as never);
    expect(r.status).toBe(400);
  });
});
