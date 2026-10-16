// Katalog (Materialien, Leistungen, Ordner): Rechte, berechneter Verkaufspreis, Ordner-Regeln.
// Arbeitet mit eigenen Wegwerf-Daten (TEST-…), räumt am Ende alles auf.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vkBerechnen } from "@/lib/katalog";
import {
  adminClient,
  anonClient,
  einloggen,
  testNutzerAnlegen,
  testNutzerLoeschen,
  type TestNutzer,
} from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;

let admin: TestNutzer, buero: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, malerC: SupabaseClient;
let farben: string, dispersion: string, tapeten: string, leistungsOrdner: string;
let material: string, leistung: string;

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([
    testNutzerAnlegen("admin"),
    testNutzerAnlegen("buero"),
    testNutzerAnlegen("mitarbeiter"),
  ]);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
});

afterAll(async () => {
  const db = adminClient();
  const nutzer = [admin, buero, maler].filter(Boolean).map((n) => n.id);
  await db.from("materials").delete().in("created_by", nutzer);
  await db.from("services").delete().in("created_by", nutzer);
  // Unterordner vor Oberordnern löschen
  for (let i = 0; i < 5; i++) await db.from("catalog_folders").delete().in("created_by", nutzer).like("name", `${kennung}%`);
  await db.from("catalog_folders").delete().in("created_by", nutzer);
  await Promise.all([admin, buero, maler].map(testNutzerLoeschen));
});

describe("Ordner", () => {
  it("Büro und Admin legen Ordner und Unterordner an, getrennt nach Material und Leistung", async () => {
    const a = await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} Farben` }).select("id").single();
    expect(a.error).toBeNull();
    farben = a.data!.id;
    const b = await adminC.from("catalog_folders").insert({ art: "material", name: `${kennung} Dispersion`, parent_id: farben }).select("id").single();
    expect(b.error).toBeNull();
    dispersion = b.data!.id;
    const c = await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} Tapeten` }).select("id").single();
    tapeten = c.data!.id;
    const d = await bueroC.from("catalog_folders").insert({ art: "leistung", name: `${kennung} Malerarbeiten` }).select("id").single();
    expect(d.error).toBeNull();
    leistungsOrdner = d.data!.id;
  });

  it("Mitarbeiter sehen, ändern und legen nichts an; ohne Login geht auch nichts", async () => {
    expect((await malerC.from("catalog_folders").select("id").eq("id", farben)).data ?? []).toEqual([]);
    expect((await malerC.from("catalog_folders").insert({ art: "material", name: `${kennung} Hack` })).error).not.toBeNull();
    const upd = await malerC.from("catalog_folders").update({ name: "x" }).eq("id", farben).select("id");
    expect(upd.data ?? []).toEqual([]);
    expect((await anonClient().from("catalog_folders").select("id")).data ?? []).toEqual([]);
  });

  it("gleicher Name im selben Ordner nur einmal (ohne Groß-/Kleinschreibung), in anderen Ordnern erlaubt", async () => {
    const doppelt = await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} FARBEN` });
    expect(doppelt.error?.code).toBe("23505");
    const imUnterordner = await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} Farben`, parent_id: tapeten });
    expect(imUnterordner.error).toBeNull();
  });

  it("archivierte Namen sind wieder frei", async () => {
    const tmp = await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} Temp` }).select("id").single();
    await bueroC.from("catalog_folders").update({ archiviert_am: new Date().toISOString() }).eq("id", tmp.data!.id);
    expect((await bueroC.from("catalog_folders").insert({ art: "material", name: `${kennung} Temp` })).error).toBeNull();
  });

  it("keine Schleifen, kein Unterordner einer anderen Art, Art nicht änderbar", async () => {
    const selbst = await bueroC.from("catalog_folders").update({ parent_id: farben }).eq("id", farben);
    expect(selbst.error?.code).toBe("P0001");
    // Farben in den eigenen Unterordner „Dispersion“ verschieben
    const schleife = await bueroC.from("catalog_folders").update({ parent_id: dispersion }).eq("id", farben);
    expect(schleife.error?.code).toBe("P0001");
    const andereArt = await bueroC.from("catalog_folders").insert({ art: "leistung", name: `${kennung} Falsch`, parent_id: farben });
    expect(andereArt.error?.code).toBe("P0001");
    const artWechsel = await bueroC.from("catalog_folders").update({ art: "leistung" }).eq("id", tapeten);
    expect(artWechsel.error?.code).toBe("P0001");
  });

  it("Ordner lassen sich verschieben", async () => {
    const r = await bueroC.from("catalog_folders").update({ parent_id: tapeten }).eq("id", dispersion).select("parent_id").single();
    expect(r.error).toBeNull();
    expect(r.data?.parent_id).toBe(tapeten);
    await bueroC.from("catalog_folders").update({ parent_id: farben }).eq("id", dispersion);
  });
});

describe("Materialien", () => {
  it("der Verkaufspreis wird in der Datenbank berechnet (EK × (1 + Zuschlag), auf Cent gerundet)", async () => {
    const { data, error } = await bueroC.from("materials")
      .insert({ folder_id: dispersion, artikelnr: "A-1", name: `${kennung} Dispersionsfarbe weiß`, einheit: "Eimer", ek: 19.99, zuschlag_prozent: 30 })
      .select("id, vk").single();
    expect(error).toBeNull();
    expect(Number(data!.vk)).toBe(25.99);
    expect(vkBerechnen(19.99, 30)).toBe(25.99);
    material = data!.id;
  });

  it("DB und App rechnen gleich, auch bei 4 Nachkommastellen und halben Cents", async () => {
    const faelle: [number, number][] = [[0.1, 5], [0.01, 50], [1.005, 0], [12.3456, 10], [0.29, 100], [7, 12.5]];
    for (const [ek, zuschlag] of faelle) {
      const r = await bueroC.from("materials")
        .insert({ name: `${kennung} Rechnen ${ek}/${zuschlag}`, einheit: "Stk", ek, zuschlag_prozent: zuschlag }).select("vk").single();
      expect(r.error).toBeNull();
      expect({ ek, zuschlag, vk: Number(r.data!.vk) }).toEqual({ ek, zuschlag, vk: vkBerechnen(ek, zuschlag) });
    }
  });

  it("der Verkaufspreis lässt sich nicht von Hand setzen, ändert sich aber mit EK und Zuschlag", async () => {
    const hand = await bueroC.from("materials").update({ vk: 1 }).eq("id", material);
    expect(hand.error).not.toBeNull();
    const neu = await bueroC.from("materials").update({ ek: 10, zuschlag_prozent: 25 }).eq("id", material).select("vk").single();
    expect(Number(neu.data!.vk)).toBe(12.5);
  });

  it("ungültige Werte lehnt die Datenbank ab", async () => {
    const basis = { name: `${kennung} Ungültig`, einheit: "Stk" };
    expect((await bueroC.from("materials").insert({ ...basis, ek: -1 })).error).not.toBeNull();
    expect((await bueroC.from("materials").insert({ ...basis, zuschlag_prozent: 1000 })).error).not.toBeNull();
    expect((await bueroC.from("materials").insert({ ...basis, name: "  " })).error).not.toBeNull();
    expect((await bueroC.from("materials").insert({ ...basis, einheit: "" })).error).not.toBeNull();
  });

  it("ein Material gehört nur in einen Material-Ordner", async () => {
    const falsch = await bueroC.from("materials").insert({ folder_id: leistungsOrdner, name: `${kennung} Falscher Ordner`, einheit: "Stk" });
    expect(falsch.error?.code).toBe("P0001");
    const verschieben = await bueroC.from("materials").update({ folder_id: leistungsOrdner }).eq("id", material);
    expect(verschieben.error?.code).toBe("P0001");
  });

  it("Mitarbeiter sehen weder Material noch Preise und können nichts ändern", async () => {
    expect((await malerC.from("materials").select("id, ek, vk").eq("id", material)).data ?? []).toEqual([]);
    expect((await malerC.from("materials").insert({ name: "x", einheit: "Stk" })).error).not.toBeNull();
    const upd = await malerC.from("materials").update({ ek: 0 }).eq("id", material).select("id");
    expect(upd.data ?? []).toEqual([]);
    expect((await anonClient().from("materials").select("id")).data ?? []).toEqual([]);
  });

  it("nichts wird gelöscht (kein DELETE für niemanden), Archivieren geht", async () => {
    for (const client of [bueroC, adminC, malerC]) {
      const { data } = await client.from("materials").delete().eq("id", material).select("id");
      expect(data ?? []).toEqual([]);
    }
    const arch = await bueroC.from("materials").update({ archiviert_am: new Date().toISOString() }).eq("id", material).select("archiviert_am").single();
    expect(arch.data?.archiviert_am).toBeTruthy();
  });

  it("Änderungen stehen im Protokoll (audit_log)", async () => {
    const log = await bueroC.from("audit_log").select("aktion, geaendert_von").eq("tabelle", "materials").eq("datensatz_id", material);
    expect((log.data ?? []).length).toBeGreaterThanOrEqual(2);
    expect(log.data?.every((l) => l.geaendert_von === buero.id)).toBe(true);
  });
});

describe("Leistungen", () => {
  it("Kosten + Zuschlag ergeben den Verkaufspreis, Langtext und Ordner", async () => {
    const { data, error } = await adminC.from("services")
      .insert({ folder_id: leistungsOrdner, nummer: "01.0010", name: `${kennung} Wände streichen`, langtext: "Zweimal streichen", einheit: "m²", kosten: 8.4, zuschlag_prozent: 35 })
      .select("id, vk").single();
    expect(error).toBeNull();
    expect(Number(data!.vk)).toBe(vkBerechnen(8.4, 35)); // 11,34
    expect(Number(data!.vk)).toBe(11.34);
    leistung = data!.id;
  });

  it("Mitarbeiter sehen sie nicht, nur Büro/Admin ändern, niemand löscht", async () => {
    expect((await malerC.from("services").select("id").eq("id", leistung)).data ?? []).toEqual([]);
    expect((await malerC.from("services").insert({ name: "x", einheit: "m²" })).error).not.toBeNull();
    expect(((await bueroC.from("services").update({ kosten: 9 }).eq("id", leistung).select("vk")).data ?? [])[0]?.vk).toBeDefined();
    for (const client of [bueroC, adminC, malerC]) {
      expect((await client.from("services").delete().eq("id", leistung).select("id")).data ?? []).toEqual([]);
    }
  });

  it("eine Leistung gehört nur in einen Leistungs-Ordner", async () => {
    const falsch = await bueroC.from("services").insert({ folder_id: farben, name: `${kennung} Falsch`, einheit: "m²" });
    expect(falsch.error?.code).toBe("P0001");
  });
});
