// Anrufe (Telefon-KI): Büro/Admin lesen, tragen von Hand ein und ändern; Mitarbeiter sehen nichts; Büro ohne das Recht „buero_zugang“ auch nicht;
// kein Löschen; Webhook nimmt nur mit Geheimnis an, legt nichts doppelt an und verknüpft den Kontakt über die Rufnummer.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/anrufe/route";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const MARKE = `TESTANRUF-${Date.now()}`;
const GEHEIMNIS = "test-geheimnis-anrufe";
let buero: TestNutzer, mitarbeiter: TestNutzer;
let bueroC: SupabaseClient, maC: SupabaseClient;
let kontaktId = "";
const alterWert = process.env.ANRUFE_WEBHOOK_SECRET;

function webhook(inhalt: unknown, kopf: Record<string, string> = { authorization: `Bearer ${GEHEIMNIS}` }) {
  return POST(new Request("http://localhost/api/anrufe", { method: "POST", headers: { "content-type": "application/json", ...kopf }, body: JSON.stringify(inhalt) }));
}

beforeAll(async () => {
  process.env.ANRUFE_WEBHOOK_SECRET = GEHEIMNIS;
  [buero, mitarbeiter] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, maC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(mitarbeiter.benutzername, mitarbeiter.passwort)]);
  const k = await adminClient()
    .from("contacts")
    .insert({ typ: "privat", vorname: "Test", nachname: `Anrufer ${MARKE}`, telefon: "04492 987654" })
    .select("id")
    .single();
  expect(k.error).toBeNull();
  kontaktId = k.data!.id;
});

afterAll(async () => {
  const x = adminClient();
  await x.from("calls").delete().like("zusammenfassung", `%${MARKE}%`);
  await x.from("notifications").delete().like("text", `%${MARKE}%`);
  await x.from("contacts").delete().eq("id", kontaktId);
  await Promise.all([buero, mitarbeiter].map((n) => testNutzerLoeschen(n)));
  if (alterWert === undefined) delete process.env.ANRUFE_WEBHOOK_SECRET;
  else process.env.ANRUFE_WEBHOOK_SECRET = alterWert;
});

describe("Webhook", () => {
  it("ohne oder mit falschem Geheimnis: 401, nichts wird gespeichert", async () => {
    expect((await webhook({ id: `${MARKE}-x`, zusammenfassung: MARKE }, {})).status).toBe(401);
    expect((await webhook({ id: `${MARKE}-x`, zusammenfassung: MARKE }, { authorization: "Bearer falsch" })).status).toBe(401);
    const { data } = await adminClient().from("calls").select("id").eq("anbieter_id", `${MARKE}-x`);
    expect(data).toHaveLength(0);
  });

  it("ohne gesetztes Geheimnis tut die Adresse nichts (503)", async () => {
    delete process.env.ANRUFE_WEBHOOK_SECRET;
    expect((await webhook({ id: `${MARKE}-y`, zusammenfassung: MARKE })).status).toBe(503);
    process.env.ANRUFE_WEBHOOK_SECRET = GEHEIMNIS;
  });

  it("legt den Anruf an, erkennt Kategorie und Kontakt, schickt einen Hinweis", async () => {
    const r = await webhook({ id: `${MARKE}-1`, von: "+49 4492 987654", zusammenfassung: `Möchte ein Angebot für die Fassade ${MARKE}`, dauer_sek: 95 });
    expect(r.status).toBe(200);
    const antwort = await r.json();
    expect(antwort).toMatchObject({ ok: true, doppelt: false });
    const { data } = await adminClient().from("calls").select("*").eq("id", antwort.id).single();
    expect(data).toMatchObject({ anbieter: "generisch", kategorie: "anfrage", status: "neu", contact_id: kontaktId, dauer_sek: 95, richtung: "eingehend" });
    const h = await adminClient().from("notifications").select("text").eq("typ", "anruf").like("text", `%${MARKE}%`);
    expect(h.data).toHaveLength(1);
  });

  it("derselbe Anruf noch einmal gesendet: nichts doppelt", async () => {
    const r = await webhook({ id: `${MARKE}-1`, von: "+49 4492 987654", zusammenfassung: `Möchte ein Angebot für die Fassade ${MARKE}` });
    expect((await r.json()).doppelt).toBe(true);
    const { data } = await adminClient().from("calls").select("id").eq("anbieter_id", `${MARKE}-1`);
    expect(data).toHaveLength(1);
  });

  it("Spam gibt keinen Hinweis; unbekannte Nummer bleibt ohne Kontakt", async () => {
    const r = await webhook({ id: `${MARKE}-2`, von: "030 111111", zusammenfassung: `Telefonmarketing ${MARKE}` });
    const antwort = await r.json();
    const { data } = await adminClient().from("calls").select("kategorie, contact_id").eq("id", antwort.id).single();
    expect(data).toMatchObject({ kategorie: "spam", contact_id: null });
    const h = await adminClient().from("notifications").select("id").eq("typ", "anruf").like("text", `%Telefonmarketing ${MARKE}%`);
    expect(h.data).toHaveLength(0);
  });

  it("Retell-Ereignis „call_analyzed“ wird angenommen, andere Ereignisse still bestätigt", async () => {
    const ok = await webhook({ event: "call_analyzed", call: { call_id: `${MARKE}-r1`, direction: "inbound", from_number: "+494492987654", start_timestamp: 1_792_000_000_000, end_timestamp: 1_792_000_060_000, call_analysis: { call_summary: `Rückruf wegen Lieferung ${MARKE}` } } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
    const egal = await webhook({ event: "call_started", call: { call_id: `${MARKE}-r2` } });
    expect(egal.status).toBe(200);
    expect(await egal.json()).toMatchObject({ ok: false });
  });

  it("kaputter Inhalt: 400 bzw. 422", async () => {
    const kaputt = await POST(new Request("http://localhost/api/anrufe", { method: "POST", headers: { authorization: `Bearer ${GEHEIMNIS}` }, body: "{nicht json" }));
    expect(kaputt.status).toBe(400);
    expect((await webhook({ zusammenfassung: "ohne id" })).status).toBe(422);
  });
});

describe("Rechte", () => {
  let id = "";

  it("das Büro sieht die Anrufe und trägt von Hand ein (nur als „manuell“)", async () => {
    const liste = await bueroC.from("calls").select("id").like("zusammenfassung", `%${MARKE}%`);
    expect(liste.data?.length).toBeGreaterThanOrEqual(3);
    const neu = await bueroC.from("calls").insert({ anbieter: "manuell", zusammenfassung: `Verpasster Anruf ${MARKE}`, erstellt_von: buero.id }).select("id").single();
    expect(neu.error).toBeNull();
    id = neu.data!.id;
    expect((await bueroC.from("calls").insert({ anbieter: "generisch", zusammenfassung: `Fälschung ${MARKE}`, erstellt_von: buero.id })).error).not.toBeNull();
  });

  it("das Büro ändert Status, Kategorie und Notiz; Herkunft und Zeitpunkt ändern sich nie", async () => {
    const vorher = await adminClient().from("calls").select("created_at").eq("id", id).single();
    const r = await bueroC.from("calls").update({ status: "erledigt", kategorie: "information", notiz: "zurückgerufen", anbieter: "retell", created_at: "2000-01-01T00:00:00Z" }).eq("id", id).select("anbieter, status, bearbeitet_von, created_at").single();
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ anbieter: "manuell", status: "erledigt", bearbeitet_von: buero.id });
    expect(r.data?.created_at).toBe(vorher.data?.created_at);
  });

  it("ungültiger Status oder Kategorie wird abgelehnt", async () => {
    expect((await bueroC.from("calls").update({ status: "quatsch" }).eq("id", id)).error).not.toBeNull();
    expect((await bueroC.from("calls").update({ kategorie: "quatsch" }).eq("id", id)).error).not.toBeNull();
  });

  it("ein Mitarbeiter sieht nichts und kann nichts eintragen oder ändern", async () => {
    expect((await maC.from("calls").select("id").like("zusammenfassung", `%${MARKE}%`)).data).toHaveLength(0);
    expect((await maC.from("calls").insert({ anbieter: "manuell", zusammenfassung: `x ${MARKE}`, erstellt_von: mitarbeiter.id })).error).not.toBeNull();
    await maC.from("calls").update({ status: "erledigt" }).eq("id", id);
    const { data } = await adminClient().from("calls").select("notiz").eq("id", id).single();
    expect(data?.notiz).toBe("zurückgerufen");
  });

  it("niemand löscht Anrufe", async () => {
    await bueroC.from("calls").delete().eq("id", id);
    expect((await adminClient().from("calls").select("id").eq("id", id)).data).toHaveLength(1);
  });

  it("nimmt der Admin dem Büro das Recht „buero_zugang“, sieht das Büro keine Anrufe mehr", async () => {
    const x = adminClient();
    await x.from("role_permissions").update({ stufe: "nein" }).eq("rolle", "buero").eq("recht", "buero_zugang");
    try {
      expect((await bueroC.from("calls").select("id").like("zusammenfassung", `%${MARKE}%`)).data).toHaveLength(0);
    } finally {
      await x.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "buero").eq("recht", "buero_zugang");
    }
    expect((await bueroC.from("calls").select("id").like("zusammenfassung", `%${MARKE}%`)).data?.length).toBeGreaterThan(0);
  });
});
