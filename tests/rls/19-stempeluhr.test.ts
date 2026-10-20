// Stempeluhr: jeder steuert nur seine eigene Uhr, nur auf einem Projekt, das er sehen darf und das nicht archiviert ist;
// höchstens eine Uhr pro Person; Beginn und Eintrags-ID lassen sich nicht verstellen.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, a: TestNutzer, b: TestNutzer;
let bueroC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient;
let projekt: string, projekt2: string, archiviert: string;

beforeAll(async () => {
  [buero, a, b] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, aC, bC] = await Promise.all([
    einloggen(buero.benutzername, buero.passwort),
    einloggen(a.benutzername, a.passwort),
    einloggen(b.benutzername, b.passwort),
  ]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "In Arbeit").single();
  const { data: p } = await db
    .from("projects")
    .insert([
      { projektnummer: `${kennung}-P1`, name: `${kennung} Eins`, status_id: status!.id },
      { projektnummer: `${kennung}-P2`, name: `${kennung} Zwei`, status_id: status!.id },
      { projektnummer: `${kennung}-P3`, name: `${kennung} Archiv`, status_id: status!.id, archiviert_am: new Date().toISOString() },
    ])
    .select("id, projektnummer");
  const id = (s: string) => p!.find((x) => x.projektnummer.endsWith(s))!.id;
  [projekt, projekt2, archiviert] = [id("P1"), id("P2"), id("P3")];
  await db.from("project_members").insert([
    { project_id: projekt, user_id: a.id, added_by: buero.id },
    { project_id: projekt2, user_id: a.id, added_by: buero.id },
    { project_id: archiviert, user_id: a.id, added_by: buero.id },
  ]);
});

afterAll(async () => {
  const db = adminClient();
  const ids = [projekt, projekt2, archiviert].filter(Boolean);
  await db.from("stempeluhr").delete().in("project_id", ids);
  await db.from("project_members").delete().in("project_id", ids);
  await db.from("projects").delete().in("id", ids);
  await Promise.all([buero, a, b].map((n) => testNutzerLoeschen(n)));
});

describe("Stempeluhr", () => {
  it("ein Mitglied stempelt sich auf seinem Projekt ein, Beginn und Eintrags-ID setzt die Datenbank", async () => {
    const r = await aC.from("stempeluhr").insert({ project_id: projekt }).select("user_id, gestartet_am, eintrag_id").single();
    expect(r.error).toBeNull();
    expect(r.data?.user_id).toBe(a.id);
    expect(r.data?.eintrag_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(Date.now() - new Date(r.data!.gestartet_am).getTime())).toBeLessThan(60_000);
  });

  it("höchstens eine Uhr pro Person", async () => {
    const r = await aC.from("stempeluhr").insert({ project_id: projekt2 });
    expect(r.error?.code).toBe("23505");
  });

  it("Beginn und Eintrags-ID lassen sich nicht verstellen, das Projekt schon (ohne Rolle zu wechseln)", async () => {
    const vorher = await aC.from("stempeluhr").select("gestartet_am, eintrag_id").single();
    const r = await aC
      .from("stempeluhr")
      .update({ gestartet_am: "2020-01-01T00:00:00Z", eintrag_id: crypto.randomUUID(), project_id: projekt2 })
      .eq("user_id", a.id)
      .select("gestartet_am, eintrag_id, project_id")
      .single();
    expect(r.error).toBeNull();
    expect(r.data?.gestartet_am).toBe(vorher.data?.gestartet_am);
    expect(r.data?.eintrag_id).toBe(vorher.data?.eintrag_id);
    expect(r.data?.project_id).toBe(projekt2);
  });

  it("andere sehen die Uhr nicht und können sie nicht ändern oder entfernen", async () => {
    expect((await bC.from("stempeluhr").select("user_id")).data).toHaveLength(0);
    expect((await bueroC.from("stempeluhr").select("user_id").eq("user_id", a.id)).data).toHaveLength(0);
    expect((await bC.from("stempeluhr").update({ project_id: projekt }).eq("user_id", a.id).select("user_id")).data ?? []).toHaveLength(0);
    expect((await bC.from("stempeluhr").delete().eq("user_id", a.id).select("user_id")).data ?? []).toHaveLength(0);
    expect((await adminClient().from("stempeluhr").select("user_id").eq("user_id", a.id)).data).toHaveLength(1);
  });

  it("nicht im Namen eines anderen", async () => {
    const r = await bC.from("stempeluhr").insert({ user_id: a.id, project_id: projekt });
    expect(r.error).not.toBeNull();
  });

  it("nicht auf einem fremden Projekt", async () => {
    const r = await bC.from("stempeluhr").insert({ project_id: projekt });
    expect(r.error).not.toBeNull();
  });

  it("nicht auf einem archivierten Projekt", async () => {
    await aC.from("stempeluhr").delete().eq("user_id", a.id);
    const r = await aC.from("stempeluhr").insert({ project_id: archiviert });
    expect(r.error).not.toBeNull();
  });

  it("das Büro darf auf jedem aktiven Projekt einstempeln", async () => {
    expect((await bueroC.from("stempeluhr").insert({ project_id: projekt })).error).toBeNull();
  });

  it("die eigene Uhr lässt sich entfernen", async () => {
    const r = await aC.from("stempeluhr").insert({ project_id: projekt }).select("user_id").single();
    expect(r.error).toBeNull();
    expect((await aC.from("stempeluhr").delete().eq("user_id", a.id).select("user_id")).data).toHaveLength(1);
  });

  it("ohne Login geht nichts", async () => {
    expect((await anonClient().from("stempeluhr").insert({ project_id: projekt })).error).not.toBeNull();
    expect((await anonClient().from("stempeluhr").select("user_id")).data ?? []).toHaveLength(0);
  });
});
