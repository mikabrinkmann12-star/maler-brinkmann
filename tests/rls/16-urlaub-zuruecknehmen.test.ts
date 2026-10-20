// Genehmigten Urlaub/Abfeiern zurücknehmen (Admin): nur den Rest (Zeitraum kürzen + spätere Zeiten archivieren) oder alles
// (Status verlassen, der Trigger archiviert alle Zeiten). Nichts wird gelöscht. Der Mitarbeiter darf das nicht.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

let admin: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, malerC: SupabaseClient;
const antragIds: string[] = [];

beforeAll(async () => {
  [admin, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, malerC] = await Promise.all([einloggen(admin.benutzername, admin.passwort), einloggen(maler.benutzername, maler.passwort)]);
});

afterAll(async () => {
  const a = adminClient();
  if (antragIds.length) {
    await a.from("time_entries").delete().in("leave_request_id", antragIds);
    await a.from("leave_requests").delete().in("id", antragIds);
  }
  await Promise.all([admin, maler].map((n) => testNutzerLoeschen(n)));
});

/** Antrag Mo–Fr (1.–5. März 2027, keine Feiertage) anlegen und genehmigen: 5 Zeiten werden gebucht. */
async function genehmigterAntrag(art: "urlaub" | "ueberstundenabbau" = "urlaub") {
  const neu = await adminClient()
    .from("leave_requests")
    .insert({ user_id: maler.id, von: "2027-03-01", bis: "2027-03-05", art })
    .select("id")
    .single();
  expect(neu.error).toBeNull();
  const id = neu.data!.id as string;
  antragIds.push(id);
  const ok = await adminC.from("leave_requests").update({ status: "genehmigt" }).eq("id", id).select("id");
  expect(ok.data).toHaveLength(1);
  return id;
}

const aktive = async (id: string) =>
  (await adminClient().from("time_entries").select("datum").eq("leave_request_id", id).is("archiviert_am", null).order("datum")).data?.map((z) => z.datum) ?? [];

describe("Urlaub zurücknehmen", () => {
  it("Rest ab Donnerstag: Antrag endet am Mittwoch, spätere Zeiten sind archiviert, frühere bleiben", async () => {
    const id = await genehmigterAntrag();
    expect(await aktive(id)).toHaveLength(5);

    const kuerzen = await adminC.from("leave_requests").update({ bis: "2027-03-03", antwort: "Zurückgenommen ab 04.03.2027" }).eq("id", id).eq("status", "genehmigt").select("id");
    expect(kuerzen.data).toHaveLength(1);
    const archiv = await adminC.from("time_entries").update({ archiviert_am: new Date().toISOString() }).eq("leave_request_id", id).gte("datum", "2027-03-04").is("archiviert_am", null).select("id");
    expect(archiv.data).toHaveLength(2);

    expect(await aktive(id)).toEqual(["2027-03-01", "2027-03-02", "2027-03-03"]);
    // Gekürzt wird nicht neu gebucht
    const antrag = await adminClient().from("leave_requests").select("status, bis").eq("id", id).single();
    expect(antrag.data).toMatchObject({ status: "genehmigt", bis: "2027-03-03" });
    // Archivierte Zeiten sind noch da (nichts gelöscht)
    const alle = await adminClient().from("time_entries").select("id").eq("leave_request_id", id);
    expect(alle.data).toHaveLength(5);
  });

  it("ganz zurücknehmen archiviert alle Zeiten (auch Abfeiern)", async () => {
    const id = await genehmigterAntrag("ueberstundenabbau");
    expect(await aktive(id)).toHaveLength(5);
    const r = await adminC.from("leave_requests").update({ status: "zurueckgezogen", antwort: "Zurückgenommen" }).eq("id", id).eq("status", "genehmigt").select("id");
    expect(r.data).toHaveLength(1);
    expect(await aktive(id)).toHaveLength(0);
    const alle = await adminClient().from("time_entries").select("id").eq("leave_request_id", id);
    expect(alle.data).toHaveLength(5);
  });

  it("der Mitarbeiter kann einen genehmigten Antrag weder zurücknehmen noch kürzen", async () => {
    const id = await genehmigterAntrag();
    const a = await malerC.from("leave_requests").update({ status: "zurueckgezogen" }).eq("id", id).select("id");
    expect(a.data ?? []).toEqual([]);
    const b = await malerC.from("leave_requests").update({ bis: "2027-03-01" }).eq("id", id).select("id");
    expect(b.data ?? []).toEqual([]);
    expect(await aktive(id)).toHaveLength(5);
  });
});
