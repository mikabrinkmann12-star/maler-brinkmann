// Angebot per Link: Büro legt Freigaben an und widerruft sie, Mitarbeiter und Fremde sehen nichts, der Schlüssel steht nur als Hash in der Datenbank,
// abgelaufene/widerrufene/falsche Schlüssel werden nicht gefunden, Öffnungen werden gezählt (30-Sekunden-Schutz), erstes Öffnen meldet dem Büro.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freigabeAnlegen, freigabeFinden, oeffnungenLaden, oeffnungErfassen, pdfHeruntergeladen } from "@/lib/angebot-freigabe-daten";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;

let buero: TestNutzer, maler: TestNutzer;
let bueroC: SupabaseClient, malerC: SupabaseClient;
let projekt: string, angebot: string;
let klartext = "";
let freigabeId = "";

beforeAll(async () => {
  [buero, maler] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, malerC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(maler.benutzername, maler.passwort)]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
  const { data: q } = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} Wohnzimmer` }).select("id").single();
  angebot = q!.id;
});

afterAll(async () => {
  const db = adminClient();
  if (angebot) {
    await db.from("quote_shares").delete().eq("quote_id", angebot);
    await db.from("quotes").delete().eq("id", angebot);
  }
  if (projekt) {
    await db.from("notifications").delete().eq("project_id", projekt);
    await db.from("projects").delete().eq("id", projekt);
  }
  await Promise.all([buero, maler].map(testNutzerLoeschen));
});

describe("Freigabe anlegen", () => {
  it("das Büro legt eine Freigabe an; in der Datenbank steht nur der Hash", async () => {
    const r = await freigabeAnlegen(bueroC as never, angebot, "kunde@example.com");
    if ("fehler" in r) throw new Error(r.fehler);
    klartext = r.klartext;
    freigabeId = r.id;
    expect(klartext).toMatch(/^[0-9a-f]{48}$/);
    const { data } = await bueroC.from("quote_shares").select("token_hash, an, open_count, created_by").eq("id", freigabeId).single();
    expect(data?.token_hash).not.toBe(klartext);
    expect(data?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data).toMatchObject({ an: "kunde@example.com", open_count: 0, created_by: buero.id });
  });

  it("Mitarbeiter und Fremde sehen und erzeugen nichts", async () => {
    expect((await malerC.from("quote_shares").select("id")).data ?? []).toEqual([]);
    expect((await anonClient().from("quote_shares").select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("quote_shares").insert({ quote_id: angebot, token_hash: "a".repeat(64) })).error).not.toBeNull();
    expect((await anonClient().from("quote_shares").insert({ quote_id: angebot, token_hash: "b".repeat(64) })).error).not.toBeNull();
  });

  it("Zähler und Hash kann das Büro nicht fälschen, Löschen geht nicht", async () => {
    await bueroC.from("quote_shares").update({ open_count: 99, first_opened_at: new Date().toISOString(), token_hash: "c".repeat(64) }).eq("id", freigabeId);
    const { data } = await adminClient().from("quote_shares").select("open_count, first_opened_at, token_hash").eq("id", freigabeId).single();
    expect(data?.open_count).toBe(0);
    expect(data?.first_opened_at).toBeNull();
    expect(data?.token_hash).not.toBe("c".repeat(64));
    const del = await bueroC.from("quote_shares").delete().eq("id", freigabeId).select("id");
    expect(del.data ?? []).toEqual([]);
  });
});

describe("Link prüfen und Öffnungen zählen", () => {
  it("der richtige Schlüssel wird gefunden, falsche nicht", async () => {
    const db = adminClient();
    expect(await freigabeFinden(db as never, klartext)).toMatchObject({ id: freigabeId, quoteId: angebot, an: "kunde@example.com" });
    expect(await freigabeFinden(db as never, randomBytes(24).toString("hex"))).toBeNull();
    expect(await freigabeFinden(db as never, "zu-kurz")).toBeNull();
    expect(await freigabeFinden(db as never, "")).toBeNull();
  });

  it("das erste Öffnen zählt, meldet dem Büro und setzt die Zeiten; ein zweites innerhalb von 30 Sekunden zählt nicht", async () => {
    const db = adminClient();
    const f = (await freigabeFinden(db as never, klartext))!;
    await oeffnungErfassen(db as never, f);
    await oeffnungErfassen(db as never, f);
    const { data } = await db.from("quote_shares").select("open_count, first_opened_at, last_opened_at").eq("id", freigabeId).single();
    expect(data?.open_count).toBe(1);
    expect(data?.first_opened_at).not.toBeNull();
    const h = await bueroC.from("notifications").select("text").eq("typ", "angebot_geoeffnet").eq("project_id", projekt);
    expect(h.data).toHaveLength(1);
    expect(h.data![0].text).toContain("kunde@example.com");
  });

  it("ein späteres Öffnen zählt weiter, meldet aber nicht noch einmal", async () => {
    const db = adminClient();
    await db.from("quote_shares").update({ last_opened_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", freigabeId);
    await oeffnungErfassen(db as never, (await freigabeFinden(db as never, klartext))!);
    expect((await db.from("quote_shares").select("open_count").eq("id", freigabeId).single()).data?.open_count).toBe(2);
    expect((await bueroC.from("notifications").select("id").eq("typ", "angebot_geoeffnet").eq("project_id", projekt)).data).toHaveLength(1);
  });

  it("PDF-Download und Zusammenfassung je Angebot", async () => {
    const db = adminClient();
    await pdfHeruntergeladen(db as never, freigabeId);
    const karte = await oeffnungenLaden(bueroC as never, [angebot]);
    const o = karte.get(angebot);
    expect(o?.anzahl).toBe(2);
    expect(o?.erstAm).not.toBeNull();
    expect(o?.pdfAm).not.toBeNull();
    expect((await oeffnungenLaden(bueroC as never, [])).size).toBe(0);
  });
});

describe("Widerruf und Ablauf", () => {
  it("ein abgelaufener Link gilt nicht mehr", async () => {
    const db = adminClient();
    await db.from("quote_shares").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", freigabeId);
    expect(await freigabeFinden(db as never, klartext)).toBeNull();
    await db.from("quote_shares").update({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", freigabeId);
    expect(await freigabeFinden(db as never, klartext)).not.toBeNull();
  });

  it("das Büro widerruft den Link, danach gilt er nicht mehr", async () => {
    const r = await bueroC.from("quote_shares").update({ revoked_at: new Date().toISOString() }).eq("id", freigabeId).select("id");
    expect(r.data).toHaveLength(1);
    expect(await freigabeFinden(adminClient() as never, klartext)).toBeNull();
  });

  it("Mitarbeiter können keinen Link widerrufen", async () => {
    const r = await malerC.from("quote_shares").update({ revoked_at: null }).eq("id", freigabeId).select("id");
    expect(r.data ?? []).toEqual([]);
  });
});
