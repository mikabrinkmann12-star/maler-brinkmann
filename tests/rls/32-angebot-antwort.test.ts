// Angebot online annehmen/ablehnen: Antwort nur über die öffentliche Seite (Dienst-Client), nur bei „versendet“, nur einmal;
// das Büro sieht die Antwort, kann sie aber nicht ändern; das Büro bekommt einen Hinweis.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { antwortLaden, antwortSpeichern, freigabeAnlegen, freigabeFinden } from "@/lib/angebot-freigabe-daten";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer;
let bueroC: SupabaseClient;
let projekt: string, angebot: string, klartext: string;

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
  const { data: q } = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} Bad` }).select("id").single();
  angebot = q!.id;
  const r = await freigabeAnlegen(bueroC as never, angebot, "kunde@example.com");
  if ("fehler" in r) throw new Error(r.fehler);
  klartext = r.klartext;
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
  await testNutzerLoeschen(buero);
});

describe("Kunden-Antwort", () => {
  it("ein Entwurf kann nicht online angenommen werden", async () => {
    const db = adminClient();
    const f = (await freigabeFinden(db as never, klartext))!;
    expect(await antwortSpeichern(db as never, f, { antwort: "angenommen", name: "Anna" })).toHaveProperty("fehler");
    expect(await antwortLaden(db as never, angebot)).toBeNull();
  });

  it("versendet: Annahme setzt Status, Antwort und Hinweis; zweite Antwort zählt nicht", async () => {
    const db = adminClient();
    await db.from("quotes").update({ status: "versendet" }).eq("id", angebot);
    const f = (await freigabeFinden(db as never, klartext))!;
    expect(await antwortSpeichern(db as never, f, { antwort: "angenommen", name: "Anna Muster" })).toEqual({ ok: true });
    expect((await db.from("quotes").select("status").eq("id", angebot).single()).data?.status).toBe("angenommen");
    expect(await antwortLaden(bueroC as never, angebot)).toMatchObject({ antwort: "angenommen", name: "Anna Muster" });
    const { data: h } = await db.from("notifications").select("typ, text").eq("project_id", projekt).eq("typ", "angebot_angenommen");
    expect(h?.[0]?.text).toContain("Anna Muster");
    expect(await antwortSpeichern(db as never, f, { antwort: "abgelehnt", name: "X" })).toHaveProperty("fehler");
    // auch direkt in der Tabelle bleibt die erste Antwort stehen
    await db.from("quote_shares").update({ antwort: "abgelehnt", antwort_name: "X" }).eq("quote_id", angebot);
    expect(await antwortLaden(db as never, angebot)).toMatchObject({ antwort: "angenommen", name: "Anna Muster" });
  });

  it("das Büro kann keine Antwort beim Anlegen einer Freigabe vortäuschen", async () => {
    const { data } = await bueroC.from("quote_shares")
      .insert({ quote_id: angebot, token_hash: randomBytes(32).toString("hex"), created_by: buero.id, antwort: "abgelehnt", antwort_am: "2026-01-01T00:00:00Z", antwort_name: "Gefälscht" })
      .select("antwort, antwort_am, antwort_name").single();
    expect(data).toMatchObject({ antwort: null, antwort_am: null, antwort_name: null });
    expect(await antwortLaden(adminClient() as never, angebot)).toMatchObject({ antwort: "angenommen", name: "Anna Muster" });
  });

  it("das Büro kann die Antwort nicht ändern", async () => {
    await bueroC.from("quote_shares").update({ antwort_name: "Gefälscht", antwort: "abgelehnt" }).eq("quote_id", angebot);
    expect(await antwortLaden(adminClient() as never, angebot)).toMatchObject({ antwort: "angenommen", name: "Anna Muster" });
  });
});
