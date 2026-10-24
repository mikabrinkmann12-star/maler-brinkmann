// Eigene Rechnungen, Rechnungsarten: Storno und Gutschrift (eigener Nummernkreis „G-“, negative Summen, Bezug zur Rechnung), Abschlags- und
// Schlussrechnung (Abzug der Abschläge in der Datenbank). Wegwerf-Daten (TEST-…) in einem eigenen Testjahr; fertige Rechnungen sind gesperrt und
// bleiben archiviert übrig (zu „Lexware“-Rechnungen ohne Nummer gemacht, damit spätere Läufe nicht gestört werden).
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
const JAHR = 2018;
let buero: TestNutzer;
let bueroC: SupabaseClient;
let projekt = "", kontakt = "", angebot = "";
let alteEinstellung: Record<string, unknown> = {};
let alteZaehler: { gruppe: string; jahr: number; letzte: number }[] = [];
const db = () => adminClient();

type Neu = { art?: string; bezug?: string; quote?: string; datum?: string; position?: [number, number] };

async function entwurf({ art = "rechnung", bezug, quote, datum = `${JAHR}-03-10`, position = [10, 12.5] }: Neu = {}): Promise<string> {
  const { data, error } = await db()
    .from("invoices")
    .insert({ project_id: projekt, contact_id: kontakt, quote_id: quote ?? null, betreff: `${kennung} Rechnung`, rechnungsdatum: datum, leistung_von: datum, leistung_bis: datum, art, bezug_id: bezug ?? null, created_by: buero.id })
    .select("id")
    .single();
  expect(error).toBeNull();
  const r = await db().from("invoice_items").insert({ invoice_id: data!.id, sortierung: 0, typ: "position", kurztext: "Wände streichen", menge: position[0], einheit: "m²", einzelpreis: position[1] });
  expect(r.error).toBeNull();
  return data!.id;
}

const fertig = (id: string, netto: number, brutto: number) => bueroC.rpc("rechnung_finalisieren", { p_id: id, p_netto: netto, p_brutto: brutto });
const zeile = async (id: string) => (await db().from("invoices").select("*").eq("id", id).single()).data!;

async function aufraeumen(): Promise<number> {
  const { data } = await db().from("invoices").select("id, status, bezug_id").like("betreff", "TEST-% Rechnung");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) await db().from("invoice_abschlaege").delete().in("invoice_id", ids);
  // Entwürfe löschen, zuerst die mit Bezug (sie verweisen auf andere Rechnungen)
  const entwuerfe = (data ?? []).filter((r) => r.status === "entwurf").sort((x, y) => Number(Boolean(y.bezug_id)) - Number(Boolean(x.bezug_id)));
  for (const r of entwuerfe) {
    await db().from("invoice_items").delete().eq("invoice_id", r.id);
    await db().from("invoices").delete().eq("id", r.id);
  }
  // Fertige Rechnungen sind gesperrt: archivieren und zu „Lexware“-Rechnungen ohne Nummer machen
  const { data: rest } = await db().from("invoices").select("id").like("betreff", "TEST-% Rechnung");
  for (const r of rest ?? []) {
    await db().from("invoices").update({ anbieter: "lexware", rechnungsnummer: null, created_by: null, archiviert_am: new Date().toISOString(), pdf_pfad: null, lexware_status: "paid" }).eq("id", r.id);
  }
  return (rest ?? []).length;
}

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  await aufraeumen();
  const { data: status } = await db().from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db().from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
  const { data: k } = await db().from("contacts").insert({ typ: "firma", firmenname: `${kennung} GmbH`, strasse: "Hauptstr. 1", plz: "26683", ort: "Saterland", kundennummer: `${kennung}-K` }).select("id").single();
  kontakt = k!.id;
  const { data: q } = await db().from("quotes").insert({ project_id: projekt, betreff: `${kennung} Angebot`, status: "angenommen" }).select("id").single();
  angebot = q!.id;
  const { data: e } = await db().from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle();
  const ohne = { ...((e?.wert as Record<string, unknown> | null) ?? {}) };
  for (const s of ["rechnung_praefix", "rechnung_start", "gutschrift_praefix", "gutschrift_start"]) delete ohne[s];
  alteEinstellung = ohne;
  await db().from("app_settings").upsert({ schluessel: "nummernkreise", wert: ohne });
  const { data: z } = await db().from("invoice_counters").select("gruppe, jahr, letzte").eq("jahr", JAHR);
  alteZaehler = z ?? [];
  await db().from("invoice_counters").delete().eq("jahr", JAHR);
});

afterAll(async () => {
  const uebrig = await aufraeumen();
  await db().from("invoice_counters").delete().eq("jahr", JAHR);
  if (alteZaehler.length) await db().from("invoice_counters").insert(alteZaehler);
  await db().from("app_settings").upsert({ schluessel: "nummernkreise", wert: alteEinstellung });
  const jetzt = new Date().toISOString();
  if (uebrig === 0) {
    await db().from("quotes").delete().eq("id", angebot);
    await db().from("projects").delete().eq("id", projekt);
    await db().from("contacts").delete().eq("id", kontakt);
  } else {
    await db().from("quotes").update({ archiviert_am: jetzt, created_by: null }).eq("id", angebot);
    await db().from("projects").update({ archiviert_am: jetzt, created_by: null }).eq("id", projekt);
    await db().from("contacts").update({ archiviert_am: jetzt, created_by: null }).eq("id", kontakt);
  }
  await testNutzerLoeschen(buero);
});

describe("Storno und Gutschrift", () => {
  let original = "", originalNr = "";

  it("eine fertige Rechnung bekommt R-…-0001", async () => {
    original = await entwurf();
    const r = await fertig(original, 125, 148.75);
    expect(r.error).toBeNull();
    originalNr = r.data as string;
    expect(originalNr).toBe(`R-${JAHR}-0001`);
  });

  it("Gutschrift: eigener Nummernkreis, negative Summen, Bezug; die Rechnung bleibt gültig", async () => {
    const g = await entwurf({ art: "gutschrift", bezug: original, position: [2, 12.5] });
    const r = await fertig(g, -25, -29.75);
    expect(r.error).toBeNull();
    expect(r.data).toBe(`G-${JAHR}-0001`);
    const z = await zeile(g);
    expect(z).toMatchObject({ status: "uebertragen", art: "gutschrift", netto: -25, brutto: -29.75, lexware_status: "open", bezug_id: original });
    expect((await zeile(original)).lexware_status).toBe("open");
  });

  it("die Summen einer Gutschrift müssen negativ sein, die einer Rechnung nicht", async () => {
    const g = await entwurf({ art: "gutschrift", bezug: original });
    expect((await fertig(g, 25, 29.75)).error?.message).toContain("negativ");
    const n = await entwurf();
    expect((await fertig(n, -5, -5)).error?.message).toContain("nicht negativ");
  });

  it("Storno: eigene Nummer, die Rechnung gilt als storniert, das Storno selbst ist erledigt (nicht offen)", async () => {
    const s = await entwurf({ art: "storno", bezug: original });
    const r = await fertig(s, -125, -148.75);
    expect(r.error).toBeNull();
    expect(r.data).toBe(`G-${JAHR}-0002`);
    const o = await zeile(original);
    expect(o.lexware_status).toBe("voided");
    expect(o.storniert_am).not.toBeNull();
    const z = await zeile(s);
    expect(z).toMatchObject({ lexware_status: "paid", brutto: -148.75 });
    expect(z.bezahlt_am).not.toBeNull();
  });

  it("eine stornierte Rechnung lässt sich nicht noch einmal stornieren und bekommt keine Gutschrift", async () => {
    const s2 = await entwurf({ art: "storno", bezug: original });
    expect((await fertig(s2, -125, -148.75)).error?.message).toContain("schon storniert");
    const g2 = await entwurf({ art: "gutschrift", bezug: original });
    expect((await fertig(g2, -1, -1.19)).error?.message).toContain("schon storniert");
  });

  it("Gutschrift gibt es nur zu einer fertigen Rechnung der App, nicht zu einer Gutschrift oder einem Entwurf", async () => {
    const offenerEntwurf = await entwurf();
    const g = await entwurf({ art: "gutschrift", bezug: offenerEntwurf });
    expect((await fertig(g, -1, -1)).error?.message).toContain("fertigen Rechnung der App");
    const { data: gs } = await db().from("invoices").select("id").eq("art", "gutschrift").eq("bezug_id", original).eq("status", "uebertragen").single();
    const gg = await entwurf({ art: "gutschrift", bezug: gs!.id });
    expect((await fertig(gg, -1, -1)).error?.message).toContain("fertigen Rechnung der App");
  });

  it("Art und Bezug lassen sich nachträglich nicht ändern, Gutschrift ohne Bezug gibt es nicht", async () => {
    const e = await entwurf();
    expect((await bueroC.from("invoices").update({ art: "storno" }).eq("id", e)).error).not.toBeNull();
    const ohneBezug = await db().from("invoices").insert({ project_id: projekt, contact_id: kontakt, betreff: `${kennung} Rechnung`, art: "gutschrift", created_by: buero.id });
    expect(ohneBezug.error).not.toBeNull();
    const mitBezugAberRechnung = await db().from("invoices").insert({ project_id: projekt, contact_id: kontakt, betreff: `${kennung} Rechnung`, art: "rechnung", bezug_id: original, created_by: buero.id });
    expect(mitBezugAberRechnung.error).not.toBeNull();
  });
});

describe("Abschlag und Schlussrechnung", () => {
  it("zwei Abschläge haben normale Rechnungsnummern", async () => {
    const a1 = await entwurf({ art: "abschlag", quote: angebot, position: [1, 390.33] });
    const a2 = await entwurf({ art: "abschlag", quote: angebot, position: [1, 100] });
    const r1 = await fertig(a1, 390.33, 464.49);
    const r2 = await fertig(a2, 100, 119);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect([r1.data, r2.data]).toEqual([`R-${JAHR}-0002`, `R-${JAHR}-0003`]);
  });

  it("die Schlussrechnung zieht die fertigen Abschläge ab und merkt sie sich", async () => {
    const s = await entwurf({ art: "schluss", quote: angebot, position: [104, 12.5] });
    const r = await fertig(s, 1300, 1547);
    expect(r.error).toBeNull();
    expect(r.data).toBe(`R-${JAHR}-0004`);
    const z = await zeile(s);
    expect(Number(z.abzug_netto)).toBe(490.33);
    expect(Number(z.abzug_brutto)).toBe(583.49);
    expect(Number(z.netto)).toBe(809.67);
    expect(Number(z.brutto)).toBe(963.51);
    const { data: snap } = await db().from("invoice_abschlaege").select("abschlag_id").eq("invoice_id", s);
    expect(snap).toHaveLength(2);
  });

  it("ein stornierter Abschlag wird nicht abgezogen, und mehr Abschläge als Rechnungssumme gehen nicht", async () => {
    const a3 = await entwurf({ art: "abschlag", quote: angebot, position: [1, 5000] });
    expect((await fertig(a3, 5000, 5950)).error).toBeNull();
    const s2 = await entwurf({ art: "schluss", quote: angebot, position: [200, 12.5] });
    expect((await fertig(s2, 2500, 2975)).error?.message).toContain("übersteigen");
    // Abschlag stornieren: danach wird er nicht mehr abgezogen
    const { data: a3zeile } = await db().from("invoices").select("id").eq("quote_id", angebot).eq("art", "abschlag").eq("brutto", 5950).single();
    const st = await entwurf({ art: "storno", bezug: a3zeile!.id, position: [1, 5000] });
    expect((await fertig(st, -5000, -5950)).error).toBeNull();
    const ok = await fertig(s2, 2500, 2975);
    expect(ok.error).toBeNull();
    expect(Number((await zeile(s2)).brutto)).toBe(2391.51);
  });

  it("die Datenbank verlangt für eine Schlussrechnung ein Angebot", async () => {
    const ohne = await entwurf({ art: "schluss" });
    expect((await fertig(ohne, 10, 11.9)).error?.message).toContain("braucht ein Angebot");
  });
});

describe("Nummernkreise getrennt", () => {
  it("Gutschrift-Zähler und Rechnungs-Zähler laufen unabhängig", async () => {
    const { data: z } = await db().from("invoice_counters").select("gruppe, letzte").eq("jahr", JAHR).order("gruppe");
    expect(z).toEqual([{ gruppe: "gutschrift", letzte: 3 }, { gruppe: "rechnung", letzte: 6 }]);
  });

  it("Kürzel der Gutschriften kommt aus den Einstellungen", async () => {
    await db().from("app_settings").upsert({ schluessel: "nummernkreise", wert: { ...alteEinstellung, gutschrift_praefix: "GS" } });
    const o = await entwurf();
    expect((await fertig(o, 125, 148.75)).data).toBe(`R-${JAHR}-0007`);
    const g = await entwurf({ art: "gutschrift", bezug: o });
    expect((await fertig(g, -25, -29.75)).data).toBe(`GS${JAHR}-0004`);
  });
});
