// Website-Anfragen: Webhook nur mit Geheimnis, nichts doppelt, Hinweis an die Glocke; Büro/Admin lesen und ändern, Mitarbeiter und
// ohne Login nichts; niemand trägt von Hand ein oder löscht; Annehmen legt genau einen Kontakt an bzw. verknüpft einen vorhandenen.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/anfragen/route";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const MARKE = `TEST-ANFRAGE-${Date.now()}`;
const GEHEIMNIS = "test-geheimnis-anfragen";
let buero: TestNutzer, mitarbeiter: TestNutzer;
let bueroC: SupabaseClient, maC: SupabaseClient;
const alterWert = process.env.ANFRAGEN_WEBHOOK_SECRET;
const ID1 = randomUUID();
const ID2 = randomUUID();
let vorhandenerKontakt = "";

const anfrage = (id: string, felder: Record<string, unknown> = {}) => ({
  id,
  name: `Max ${MARKE}`,
  telefon: "040 66969 777",
  email: "test-anfrage@example.com",
  betreff: "Fassade",
  nachricht: `Bitte um Angebot ${MARKE}`,
  quelle: "website",
  datenschutz: true,
  ...felder,
});

function webhook(inhalt: unknown, kopf: Record<string, string> = { "x-webhook-secret": GEHEIMNIS }) {
  return POST(new Request("http://localhost/api/anfragen", { method: "POST", headers: { "content-type": "application/json", ...kopf }, body: JSON.stringify(inhalt) }));
}

beforeAll(async () => {
  process.env.ANFRAGEN_WEBHOOK_SECRET = GEHEIMNIS;
  [buero, mitarbeiter] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, maC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(mitarbeiter.benutzername, mitarbeiter.passwort)]);
  const k = await adminClient().from("contacts").insert({ typ: "privat", vorname: "Test", nachname: `Vorhanden ${MARKE}` }).select("id").single();
  expect(k.error).toBeNull();
  vorhandenerKontakt = k.data!.id;
});

afterAll(async () => {
  const x = adminClient();
  await x.from("website_anfragen").delete().like("nachricht", `%${MARKE}%`);
  await x.from("notifications").delete().like("text", `%${MARKE}%`);
  await x.from("contacts").delete().like("nachname", `%${MARKE}%`);
  await Promise.all([buero, mitarbeiter].map((n) => testNutzerLoeschen(n)));
  if (alterWert === undefined) delete process.env.ANFRAGEN_WEBHOOK_SECRET;
  else process.env.ANFRAGEN_WEBHOOK_SECRET = alterWert;
});

describe("Webhook", () => {
  it("ohne oder mit falschem Geheimnis: 401, ?key= zählt nicht", async () => {
    expect((await webhook(anfrage(ID1), {})).status).toBe(401);
    expect((await webhook(anfrage(ID1), { "x-webhook-secret": "falsch" })).status).toBe(401);
    const mitKey = await POST(new Request(`http://localhost/api/anfragen?key=${GEHEIMNIS}`, { method: "POST", body: JSON.stringify(anfrage(ID1)) }));
    expect(mitKey.status).toBe(401);
    expect((await adminClient().from("website_anfragen").select("id").eq("id", ID1)).data).toHaveLength(0);
  });

  it("ohne gesetztes Geheimnis tut die Adresse nichts (503)", async () => {
    delete process.env.ANFRAGEN_WEBHOOK_SECRET;
    expect((await webhook(anfrage(ID1))).status).toBe(503);
    process.env.ANFRAGEN_WEBHOOK_SECRET = GEHEIMNIS;
  });

  it("zu groß (413), kein JSON (400), Pflichtfelder fehlen (422)", async () => {
    expect((await webhook(anfrage(ID1, { nachricht: "x".repeat(60_000) }))).status).toBe(413);
    const kaputt = await POST(new Request("http://localhost/api/anfragen", { method: "POST", headers: { "x-webhook-secret": GEHEIMNIS }, body: "{kein json" }));
    expect(kaputt.status).toBe(400);
    expect((await webhook(anfrage(ID1, { telefon: "", email: "" }))).status).toBe(422);
    expect((await webhook(anfrage(ID1, { nachricht: "" }))).status).toBe(422);
    expect((await webhook(anfrage("keine-uuid"))).status).toBe(422);
  });

  it("legt die Anfrage an und schickt einen Hinweis „anfrage“ (auch mit Bearer)", async () => {
    const r = await webhook(anfrage(ID1));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, id: ID1, doppelt: false });
    const { data } = await adminClient().from("website_anfragen").select("*").eq("id", ID1).single();
    expect(data).toMatchObject({ status: "neu", quelle: "website", contact_id: null, telefon: "040 66969 777" });
    const h = await adminClient().from("notifications").select("text").eq("typ", "anfrage").like("text", `%${MARKE}%`);
    expect(h.data).toHaveLength(1);
    expect(h.data![0].text).toBe(`Neue Website-Anfrage von Max ${MARKE}: Fassade`);

    const zwei = await webhook(anfrage(ID2, { email: "", betreff: "" }), { authorization: `Bearer ${GEHEIMNIS}` });
    expect(zwei.status).toBe(200);
  });

  it("dieselbe Anfrage noch einmal gesendet: nichts doppelt, kein zweiter Hinweis", async () => {
    const r = await webhook(anfrage(ID1, { name: "Jemand anders" }));
    expect(await r.json()).toMatchObject({ ok: true, doppelt: true });
    expect((await adminClient().from("website_anfragen").select("name").eq("id", ID1).single()).data?.name).toBe(`Max ${MARKE}`);
    const h = await adminClient().from("notifications").select("id").eq("typ", "anfrage").like("text", `%Max ${MARKE}: Fassade%`);
    expect(h.data).toHaveLength(1);
  });
});

describe("Rechte", () => {
  it("ohne Login: nichts lesen, nichts eintragen", async () => {
    const anon = anonClient();
    const lesen = await anon.from("website_anfragen").select("id").eq("id", ID1);
    expect(lesen.data ?? []).toHaveLength(0);
    expect((await anon.from("website_anfragen").insert({ name: "x", telefon: "1", nachricht: `x ${MARKE}` })).error).not.toBeNull();
    expect((await anon.rpc("anfrage_annehmen", { p_id: ID1, p_contact_id: vorhandenerKontakt })).error).not.toBeNull();
  });

  it("ein Mitarbeiter sieht nichts und kann nichts ändern oder annehmen", async () => {
    expect((await maC.from("website_anfragen").select("id").eq("id", ID1)).data).toHaveLength(0);
    await maC.from("website_anfragen").update({ status: "abgelehnt" }).eq("id", ID1);
    expect((await maC.rpc("anfrage_annehmen", { p_id: ID1, p_contact_id: vorhandenerKontakt })).error).not.toBeNull();
    expect((await adminClient().from("website_anfragen").select("status").eq("id", ID1).single()).data?.status).toBe("neu");
  });

  it("das Büro sieht die Anfragen, trägt aber nichts selbst ein und löscht nichts", async () => {
    expect((await bueroC.from("website_anfragen").select("id").like("nachricht", `%${MARKE}%`)).data).toHaveLength(2);
    expect((await bueroC.from("website_anfragen").insert({ name: "x", telefon: "1", nachricht: `x ${MARKE}` })).error).not.toBeNull();
    await bueroC.from("website_anfragen").delete().eq("id", ID2);
    expect((await adminClient().from("website_anfragen").select("id").eq("id", ID2)).data).toHaveLength(1);
  });

  it("Inhalt der Anfrage ist unveränderlich, Status/Notiz nicht; „angenommen“ nur mit Kontakt", async () => {
    const r = await bueroC.from("website_anfragen").update({ name: "Gefälscht", nachricht: "neu", notiz: "kein Malerauftrag", status: "abgelehnt" }).eq("id", ID2).select("name, notiz, status, bearbeitet_von").single();
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ name: `Max ${MARKE}`, notiz: "kein Malerauftrag", status: "abgelehnt", bearbeitet_von: buero.id });
    expect((await bueroC.from("website_anfragen").update({ status: "angenommen" }).eq("id", ID2)).error).not.toBeNull();
    expect((await bueroC.from("website_anfragen").update({ status: "quatsch" }).eq("id", ID2)).error).not.toBeNull();
  });

  it("Annehmen legt genau einen Kontakt an, auch bei doppeltem Klick", async () => {
    const kontakt = { kundennummer: `TEST-${Date.now()}`, vorname: "Max", nachname: `Mustermann ${MARKE}`, telefon: "040 66969 777", email: "test-anfrage@example.com", notizen: "Website-Anfrage" };
    const [a, b] = await Promise.all([
      bueroC.rpc("anfrage_annehmen", { p_id: ID1, p_kontakt: kontakt }),
      bueroC.rpc("anfrage_annehmen", { p_id: ID1, p_kontakt: kontakt }),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data).toBe(b.data);
    const k = await adminClient().from("contacts").select("id, typ, vorname, nachname").like("nachname", `Mustermann ${MARKE}`);
    expect(k.data).toHaveLength(1);
    expect(k.data![0]).toMatchObject({ id: a.data, typ: "privat", vorname: "Max" });
    expect((await adminClient().from("website_anfragen").select("status, contact_id").eq("id", ID1).single()).data).toEqual({ status: "angenommen", contact_id: a.data });
  });

  it("Annehmen mit vorhandenem Kontakt verknüpft nur (auch nach Ablehnen möglich); ohne Nachname kein neuer Kontakt", async () => {
    expect((await bueroC.rpc("anfrage_annehmen", { p_id: ID2, p_kontakt: { vorname: "Ohne" } })).error).not.toBeNull();
    const r = await bueroC.rpc("anfrage_annehmen", { p_id: ID2, p_contact_id: vorhandenerKontakt });
    expect(r.error).toBeNull();
    expect(r.data).toBe(vorhandenerKontakt);
    expect((await adminClient().from("website_anfragen").select("status, contact_id").eq("id", ID2).single()).data).toEqual({ status: "angenommen", contact_id: vorhandenerKontakt });
  });

  it("nimmt der Admin dem Büro das Recht „buero_zugang“, sieht das Büro keine Anfragen mehr", async () => {
    const x = adminClient();
    await x.from("role_permissions").update({ stufe: "nein" }).eq("rolle", "buero").eq("recht", "buero_zugang");
    try {
      expect((await bueroC.from("website_anfragen").select("id").like("nachricht", `%${MARKE}%`)).data).toHaveLength(0);
    } finally {
      await x.from("role_permissions").update({ stufe: "ja" }).eq("rolle", "buero").eq("recht", "buero_zugang");
    }
    expect((await bueroC.from("website_anfragen").select("id").like("nachricht", `%${MARKE}%`)).data).toHaveLength(2);
  });
});
