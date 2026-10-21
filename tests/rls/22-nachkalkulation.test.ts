// Nachkalkulation: „Kosten erfassen“ (project_costs) nur für Büro/Admin, nichts wird gelöscht, Ersteller bleibt, Kostenart der
// Eingangsrechnungen ist begrenzt. Arbeitet mit Wegwerf-Daten (TEST-…) und räumt am Ende auf.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, ma: TestNutzer;
let bueroC: SupabaseClient, maC: SupabaseClient;
let projekt = "";
let kostenId = "";

beforeAll(async () => {
  [buero, ma] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, maC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(ma.benutzername, ma.passwort)]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
});

afterAll(async () => {
  const db = adminClient();
  await db.from("project_costs").update({ erstellt_von: null }).eq("project_id", projekt);
  await db.from("incoming_invoices").delete().eq("project_id", projekt);
  await db.from("projects").update({ archiviert_am: new Date().toISOString(), created_by: null }).eq("id", projekt);
  await Promise.all([buero, ma].map((n) => testNutzerLoeschen(n)));
});

describe("Kosten erfassen", () => {
  it("das Büro erfasst Kosten und liest sie wieder", async () => {
    const r = await bueroC.from("project_costs").insert({ project_id: projekt, kostenart: "geraete", betrag: 120.5, beschreibung: "Gerüst-Miete" }).select("id, erstellt_von").single();
    expect(r.error).toBeNull();
    expect(r.data?.erstellt_von).toBe(buero.id);
    kostenId = r.data!.id;
    const l = await bueroC.from("project_costs").select("betrag").eq("project_id", projekt);
    expect(l.data?.map((k) => Number(k.betrag))).toEqual([120.5]);
  });

  it("ein Mitarbeiter sieht und erfasst nichts", async () => {
    const l = await maC.from("project_costs").select("id").eq("project_id", projekt);
    expect(l.data ?? []).toHaveLength(0);
    const r = await maC.from("project_costs").insert({ project_id: projekt, kostenart: "material", betrag: 5 });
    expect(r.error).not.toBeNull();
  });

  it("falsche Kostenart und negative Beträge werden abgelehnt", async () => {
    expect((await bueroC.from("project_costs").insert({ project_id: projekt, kostenart: "lohn", betrag: 5 })).error?.code).toBe("23514");
    expect((await bueroC.from("project_costs").insert({ project_id: projekt, kostenart: "material", betrag: -1 })).error?.code).toBe("23514");
  });

  it("nichts wird gelöscht, Archivieren geht, der Ersteller bleibt", async () => {
    const del = await bueroC.from("project_costs").delete().eq("id", kostenId).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const up = await bueroC.from("project_costs").update({ archiviert_am: new Date().toISOString(), erstellt_von: ma.id }).eq("id", kostenId).select("erstellt_von, archiviert_am").single();
    expect(up.error).toBeNull();
    expect(up.data?.archiviert_am).not.toBeNull();
    expect(up.data?.erstellt_von).toBe(buero.id);
  });
});

describe("Kostenart der Eingangsrechnung", () => {
  it("steht auf Material und lässt nur die vier Kostenarten zu", async () => {
    const db = adminClient();
    const { data, error } = await db
      .from("incoming_invoices")
      .insert({ lieferant: `${kennung} Lieferant`, storage_pfad: `${kennung}.pdf`, dateiname: "x.pdf", project_id: projekt, netto: 100 })
      .select("id, kostenart")
      .single();
    expect(error).toBeNull();
    expect(data?.kostenart).toBe("material");
    const up = await bueroC.from("incoming_invoices").update({ kostenart: "fremdleistung" }).eq("id", data!.id).select("kostenart").single();
    expect(up.data?.kostenart).toBe("fremdleistung");
    expect((await bueroC.from("incoming_invoices").update({ kostenart: "lohn" }).eq("id", data!.id)).error?.code).toBe("23514");
  });
});
