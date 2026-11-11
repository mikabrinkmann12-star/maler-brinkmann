// Lohnanteil (§ 35a EStG) je Rechnungsposition: beim Erstellen aus dem Angebot aus der Kalkulation der Katalog-Leistung, 0 bei Material,
// voller Preis bei freien Stunden-Positionen, unbekannt bei sonstigen freien Positionen; die Datenbank lehnt einen Lohn über dem Preis ab.
// Wegwerf-Daten (TEST-…), nur Entwürfe, werden wieder gelöscht.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STANDARD_EINSTELLUNGEN, einstellungenAusJson, kalkulieren } from "@/lib/kalkulation";
import { rechnungEntwurfAusAngebot } from "@/lib/rechnung-erstellen";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer;
let bueroC: SupabaseClient;
let projekt = "", kontakt = "", angebot = "", leistung = "", material = "";
const rechnungen: string[] = [];
const db = () => adminClient();
const KALK = { lohngruppeId: "", lohnMinuten: 30, material: 2, geraete: 0, fremdleistung: 0, sonstiges: 0 };

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  const { data: status } = await db().from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: k } = await db().from("contacts").insert({ typ: "privat", vorname: "Anna", nachname: `${kennung}`, strasse: "Hauptstr. 1", plz: "26683", ort: "Saterland", kundennummer: `${kennung}-K` }).select("id").single();
  kontakt = k!.id;
  const { data: p } = await db().from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id, contact_id: kontakt }).select("id").single();
  projekt = p!.id;
  const { data: s } = await db().from("services").insert({ name: `${kennung} Wand streichen`, einheit: "m²", kosten: 10, zuschlag_prozent: 50, kalkulation: KALK }).select("id").single();
  leistung = s!.id;
  const { data: m } = await db().from("materials").insert({ name: `${kennung} Farbe`, einheit: "l", ek: 5, zuschlag_prozent: 20 }).select("id").single();
  material = m!.id;
  const { data: q } = await db().from("quotes").insert({ project_id: projekt, betreff: `${kennung} Angebot`, status: "entwurf" }).select("id").single();
  angebot = q!.id;
  const r = await db().from("quote_items").insert([
    { quote_id: angebot, sortierung: 0, typ: "titel", kurztext: "Wohnzimmer" },
    { quote_id: angebot, sortierung: 1, typ: "position", kurztext: "Wand streichen", menge: 10, einheit: "m²", einzelpreis: 30, service_id: leistung },
    { quote_id: angebot, sortierung: 2, typ: "position", kurztext: "Farbe", menge: 2, einheit: "l", einzelpreis: 8, material_id: material },
    { quote_id: angebot, sortierung: 3, typ: "position", kurztext: "Arbeitslohn", menge: 3, einheit: "Std.", einzelpreis: 51.55 },
    { quote_id: angebot, sortierung: 4, typ: "position", kurztext: "Anfahrt", menge: 1, einheit: "psch.", einzelpreis: 75 },
  ]);
  expect(r.error).toBeNull();
  // Erst nach den Positionen annehmen (ein angenommenes Angebot ist gesperrt)
  expect((await db().from("quotes").update({ status: "angenommen" }).eq("id", angebot)).error).toBeNull();
});

afterAll(async () => {
  for (const id of rechnungen) {
    await db().from("invoice_items").delete().eq("invoice_id", id);
    await db().from("invoices").delete().eq("id", id);
  }
  await db().from("quotes").update({ status: "entwurf" }).eq("id", angebot);
  await db().from("quote_items").delete().eq("quote_id", angebot);
  await db().from("quotes").delete().eq("id", angebot);
  await db().from("projects").delete().eq("id", projekt);
  await db().from("contacts").delete().eq("id", kontakt);
  await db().from("services").delete().eq("id", leistung);
  await db().from("materials").delete().eq("id", material);
  await testNutzerLoeschen(buero);
});

describe("Lohnanteil der Rechnungspositionen", () => {
  it("übernimmt den Lohn aus der Kalkulation, 0 bei Material, voller Preis bei Stunden, unbekannt sonst", async () => {
    const e = await rechnungEntwurfAusAngebot(bueroC as never, angebot);
    expect(e.fehler).toBeUndefined();
    rechnungen.push(e.id!);
    const { data: items } = await db().from("invoice_items").select("typ, kurztext, einzelpreis, lohn_einzel").eq("invoice_id", e.id!).order("sortierung");
    const { data: k } = await db().from("kalkulation_einstellungen").select("zuschlaege, lohngruppen").maybeSingle();
    const r = kalkulieren(KALK, k ? einstellungenAusJson(k.zuschlaege, k.lohngruppen) : STANDARD_EINSTELLUNGEN);
    const erwartet = Math.round(30 * (r.vk.lohn / r.vkGesamt) * 10_000) / 10_000;
    expect(items!.map((i) => [i.kurztext, i.lohn_einzel === null ? null : Number(i.lohn_einzel)])).toEqual([
      ["Wohnzimmer", null],
      ["Wand streichen", erwartet],
      ["Farbe", 0],
      ["Arbeitslohn", 51.55],
      ["Anfahrt", null],
    ]);
  });

  it("Abschlag: Lohnanteil im Verhältnis des ganzen Auftrags", async () => {
    const e = await rechnungEntwurfAusAngebot(bueroC as never, angebot, { art: "abschlag", abschlag: { modus: "prozent", prozent: 50 } });
    expect(e.fehler).toBeUndefined();
    rechnungen.push(e.id!);
    const { data: items } = await db().from("invoice_items").select("einzelpreis, lohn_einzel").eq("invoice_id", e.id!);
    expect(items).toHaveLength(1);
    expect(Number(items![0].lohn_einzel)).toBeGreaterThan(0);
    expect(Number(items![0].lohn_einzel)).toBeLessThan(Number(items![0].einzelpreis));
  });

  it("Datenbank lehnt einen Lohnanteil über dem Preis oder unter 0 ab", async () => {
    const { data } = await db().from("invoice_items").select("id").eq("invoice_id", rechnungen[0]).eq("kurztext", "Farbe").single();
    expect((await bueroC.from("invoice_items").update({ lohn_einzel: 9 }).eq("id", data!.id)).error).not.toBeNull();
    expect((await bueroC.from("invoice_items").update({ lohn_einzel: -1 }).eq("id", data!.id)).error).not.toBeNull();
    expect((await bueroC.from("invoice_items").update({ lohn_einzel: 4 }).eq("id", data!.id)).error).toBeNull();
  });
});

describe("USt-IdNr. des Kunden", () => {
  it("Büro speichert eine gültige USt-IdNr., die Datenbank lehnt ein falsches Format ab", async () => {
    expect((await bueroC.from("contacts").update({ ust_id: "DE288936236" }).eq("id", kontakt)).error).toBeNull();
    expect((await bueroC.from("contacts").update({ ust_id: "de 288" }).eq("id", kontakt)).error).not.toBeNull();
    expect((await bueroC.from("contacts").update({ ust_id: null }).eq("id", kontakt)).error).toBeNull();
  });
});
