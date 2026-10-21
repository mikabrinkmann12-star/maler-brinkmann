// Dokumentarten (Angebot, Kostenvoranschlag, Auftragsbestätigung, Lieferschein, Bestellschein, Brief): erlaubte Werte, Standard, Nachtrag.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer;
let bueroC: SupabaseClient;
let projekt = "";

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("quotes").delete().eq("project_id", projekt);
  await db.from("projects").update({ archiviert_am: new Date().toISOString(), created_by: null }).eq("id", projekt);
  await testNutzerLoeschen(buero);
});

describe("Dokumentart", () => {
  it("ist ohne Angabe ein Angebot und kein Nachtrag", async () => {
    const r = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} a` }).select("dokumentart, nachtrag").single();
    expect(r.data).toEqual({ dokumentart: "angebot", nachtrag: false });
  });

  it("nimmt die sechs Arten und den Nachtrag an", async () => {
    for (const art of ["kostenvoranschlag", "auftragsbestaetigung", "lieferschein", "bestellschein", "brief"]) {
      const r = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} ${art}`, dokumentart: art, nachtrag: art === "brief" }).select("dokumentart, nachtrag").single();
      expect(r.error).toBeNull();
      expect(r.data?.dokumentart).toBe(art);
    }
  });

  it("lehnt unbekannte Arten ab (Rechnungen gehören der Buchhaltung)", async () => {
    const r = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} x`, dokumentart: "rechnung" });
    expect(r.error?.code).toBe("23514");
  });
});
