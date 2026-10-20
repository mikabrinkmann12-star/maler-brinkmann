// Container melden: jeder aktive Nutzer meldet, pro Art 7 Tage Sperre für alle, andere Art bleibt frei, Hinweis fürs Büro,
// nur Büro/Admin markieren „erledigt“ und heben die Sperre auf, kein Löschen, Art und Melder ändern sich nie.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let buero: TestNutzer, a: TestNutzer, b: TestNutzer;
let bueroC: SupabaseClient, aC: SupabaseClient, bC: SupabaseClient;
let vorhandeneAktive: string[] = [];

beforeAll(async () => {
  // Echte oder frühere Meldungen sperren den Test: vorübergehend freigeben und danach zurücksetzen
  const { data } = await adminClient().from("container_requests").select("id").is("freigegeben_am", null);
  vorhandeneAktive = (data ?? []).map((r) => r.id);
  if (vorhandeneAktive.length) await adminClient().from("container_requests").update({ freigegeben_am: new Date().toISOString() }).in("id", vorhandeneAktive);
  [buero, a, b] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, aC, bC] = await Promise.all([
    einloggen(buero.benutzername, buero.passwort),
    einloggen(a.benutzername, a.passwort),
    einloggen(b.benutzername, b.passwort),
  ]);
});

afterAll(async () => {
  const x = adminClient();
  await x.from("container_requests").delete().in("ausgeloest_von", [a.id, b.id, buero.id]);
  if (vorhandeneAktive.length) await x.from("container_requests").update({ freigegeben_am: null, freigegeben_von: null }).in("id", vorhandeneAktive);
  await Promise.all([buero, a, b].map((n) => testNutzerLoeschen(n)));
});

describe("Container melden", () => {
  let papierId = "";

  it("ein Mitarbeiter meldet den Papiercontainer, das Büro bekommt einen Hinweis", async () => {
    const r = await aC.from("container_requests").insert({ art: "papier" }).select("id, ausgeloest_von").single();
    expect(r.error).toBeNull();
    expect(r.data?.ausgeloest_von).toBe(a.id);
    papierId = r.data!.id;
    const h = await bueroC.from("notifications").select("text").eq("typ", "container").eq("ausgeloest_von", a.id);
    expect(h.data).toHaveLength(1);
    expect(h.data![0].text).toContain("Papiercontainer");
  });

  it("ein anderer Mitarbeiter kann den Papiercontainer nicht noch einmal melden (7 Tage Sperre für alle)", async () => {
    const r = await bC.from("container_requests").insert({ art: "papier" });
    expect(r.error?.code).toBe("P0001");
    expect(r.error?.message).toContain("schon gemeldet");
  });

  it("auch der Melder selbst nicht, und das Büro auch nicht", async () => {
    expect((await aC.from("container_requests").insert({ art: "papier" })).error?.code).toBe("P0001");
    expect((await bueroC.from("container_requests").insert({ art: "papier" })).error?.code).toBe("P0001");
  });

  it("der Restmüllcontainer hat eine eigene Sperre und bleibt frei", async () => {
    expect((await bC.from("container_requests").insert({ art: "restmuell" })).error).toBeNull();
    expect((await aC.from("container_requests").insert({ art: "restmuell" })).error?.code).toBe("P0001");
  });

  it("nur eine gültige Art und nur als man selbst", async () => {
    expect((await bC.from("container_requests").insert({ art: "sperrmuell" })).error).not.toBeNull();
    expect((await bC.from("container_requests").insert({ art: "papier", ausgeloest_von: a.id })).error).not.toBeNull();
  });

  it("alle sehen den Stand, Fremde ohne Login nicht", async () => {
    expect((await bC.from("container_requests").select("id").eq("id", papierId)).data).toHaveLength(1);
    expect((await anonClient().from("container_requests").select("id").eq("id", papierId)).data ?? []).toEqual([]);
  });

  it("Mitarbeiter ändern oder löschen nichts, das Büro markiert erledigt", async () => {
    expect((await bC.from("container_requests").update({ erledigt_am: new Date().toISOString() }).eq("id", papierId).select("id")).data ?? []).toEqual([]);
    expect((await bC.from("container_requests").delete().eq("id", papierId).select("id")).data ?? []).toEqual([]);
    const ok = await bueroC.from("container_requests").update({ erledigt_am: new Date().toISOString(), notiz: "bestellt" }).eq("id", papierId).select("erledigt_von, notiz");
    expect(ok.data).toHaveLength(1);
    expect(ok.data![0].erledigt_von).toBe(buero.id);
    // Löschen geht auch dem Büro nicht
    expect((await bueroC.from("container_requests").delete().eq("id", papierId).select("id")).data ?? []).toEqual([]);
  });

  it("Art und Melder ändern sich nie", async () => {
    await bueroC.from("container_requests").update({ art: "restmuell", ausgeloest_von: b.id }).eq("id", papierId);
    const r = await adminClient().from("container_requests").select("art, ausgeloest_von").eq("id", papierId).single();
    expect(r.data).toEqual({ art: "papier", ausgeloest_von: a.id });
  });

  it("Das Büro hebt die Sperre auf, dann kann gleich wieder gemeldet werden", async () => {
    expect((await bC.from("container_requests").update({ freigegeben_am: new Date().toISOString() }).eq("id", papierId).select("id")).data ?? []).toEqual([]);
    const frei = await bueroC.from("container_requests").update({ freigegeben_am: new Date().toISOString() }).eq("id", papierId).select("freigegeben_von");
    expect(frei.data![0].freigegeben_von).toBe(buero.id);
    expect((await bC.from("container_requests").insert({ art: "papier" })).error).toBeNull();
  });
});
