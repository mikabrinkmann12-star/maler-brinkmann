// Eigene Rechnungen: Die Datenbank vergibt die Nummer (lückenlos, je Jahr, in einer Transaktion mit dem Status), prüft Bedingungen und sperrt die
// fertige Rechnung. Wegwerf-Daten (TEST-…); fertige Rechnungen sind gesperrt und bleiben (archiviert) übrig, die Zähler werden zurückgesetzt.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, mitarbeiter: TestNutzer;
let bueroC: SupabaseClient, maC: SupabaseClient;
let projekt = "", kontakt = "";
const rechnungen: string[] = [];
let alteEinstellung: unknown = null;
let alteZaehler: { jahr: number; letzte: number }[] = [];
const JAHR = 2020; // lange her (Datum darf nicht in der Zukunft liegen), damit echte Zähler nie berührt werden

async function entwurf(datum = `${JAHR}-03-10`, mitPosition = true): Promise<string> {
  const db = adminClient();
  const { data, error } = await db.from("invoices").insert({ project_id: projekt, contact_id: kontakt, betreff: `${kennung} Rechnung`, rechnungsdatum: datum, leistung_von: datum, leistung_bis: datum, created_by: buero.id }).select("id").single();
  expect(error).toBeNull();
  rechnungen.push(data!.id);
  if (mitPosition) {
    const r = await db.from("invoice_items").insert({ invoice_id: data!.id, sortierung: 0, typ: "position", kurztext: "Wände streichen", menge: 10, einheit: "m²", einzelpreis: 12.5 });
    expect(r.error).toBeNull();
  }
  return data!.id;
}

const db = () => adminClient();

/**
 * Räumt Wegwerf-Rechnungen weg. Entwürfe werden gelöscht. Fertige Rechnungen sind gesperrt und lassen sich nicht löschen (auch nicht mit dem
 * Dienst-Schlüssel): Sie werden archiviert und zu „Lexware“-Rechnungen ohne Nummer gemacht, damit sie die Nummernprüfung späterer Läufe nicht stören.
 * Gibt die Zahl der übrig gebliebenen zurück.
 */
async function aufraeumen(): Promise<number> {
  const { data } = await db().from("invoices").select("id, status, pdf_pfad").like("betreff", "TEST-% Rechnung");
  const pfade = (data ?? []).map((r) => r.pdf_pfad).filter((x): x is string => Boolean(x));
  if (pfade.length) await db().storage.from("rechnungen").remove(pfade);
  let uebrig = 0;
  for (const r of data ?? []) {
    if (r.status === "entwurf") {
      await db().from("invoice_items").delete().eq("invoice_id", r.id);
      await db().from("invoices").delete().eq("id", r.id);
    } else {
      uebrig++;
      await db().from("invoices").update({ anbieter: "lexware", rechnungsnummer: null, created_by: null, archiviert_am: new Date().toISOString(), pdf_pfad: null }).eq("id", r.id);
    }
  }
  return uebrig;
}

beforeAll(async () => {
  [buero, mitarbeiter] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, maC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(mitarbeiter.benutzername, mitarbeiter.passwort)]);
  await aufraeumen();
  const { data: status } = await db().from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db().from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
  const { data: k } = await db().from("contacts").insert({ typ: "firma", firmenname: `${kennung} GmbH`, strasse: "Hauptstr. 1", plz: "26683", ort: "Saterland", kundennummer: `${kennung}-K` }).select("id").single();
  kontakt = k!.id;
  // Einstellung und Zähler des Testjahres sichern (die Tests verändern sie)
  const { data: e } = await db().from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle();
  alteEinstellung = e?.wert ?? null;
  // Sauberer Ausgangszustand: ohne Kürzel und Startnummer der Rechnungen (Standard „R-“ und 1), egal was ein früherer Lauf hinterlassen hat
  const ohne = { ...((alteEinstellung as Record<string, unknown> | null) ?? {}) };
  delete ohne.rechnung_praefix;
  delete ohne.rechnung_start;
  alteEinstellung = ohne;
  await db().from("app_settings").upsert({ schluessel: "nummernkreise", wert: ohne });
  const { data: z } = await db().from("invoice_counters").select("jahr, letzte").in("jahr", [JAHR, JAHR + 1]);
  alteZaehler = z ?? [];
  await db().from("invoice_counters").delete().in("jahr", [JAHR, JAHR + 1]);
});

afterAll(async () => {
  const uebrig = await aufraeumen();
  await db().from("invoice_counters").delete().in("jahr", [JAHR, JAHR + 1, JAHR + 5]);
  if (alteZaehler.length) await db().from("invoice_counters").insert(alteZaehler);
  await db().from("app_settings").upsert({ schluessel: "nummernkreise", wert: alteEinstellung as object });
  if (uebrig === 0) {
    await db().from("projects").delete().eq("id", projekt);
    await db().from("contacts").delete().eq("id", kontakt);
  } else {
    await db().from("projects").update({ archiviert_am: new Date().toISOString(), created_by: null }).eq("id", projekt);
    await db().from("contacts").update({ archiviert_am: new Date().toISOString(), created_by: null }).eq("id", kontakt);
  }
  await Promise.all([buero, mitarbeiter].map((n) => testNutzerLoeschen(n)));
});

describe("Nummer vergeben (rechnung_finalisieren)", () => {
  it("die erste Rechnung des Jahres bekommt …-0001, setzt Status, Anbieter, Summen", async () => {
    const id = await entwurf();
    const r = await bueroC.rpc("rechnung_finalisieren", { p_id: id, p_netto: 125, p_brutto: 148.75 });
    expect(r.error).toBeNull();
    expect(r.data).toBe(`R-${JAHR}-0001`);
    const { data } = await adminClient().from("invoices").select("status, anbieter, rechnungsnummer, lexware_status, netto, brutto, uebertragen_am").eq("id", id).single();
    expect(data).toMatchObject({ status: "uebertragen", anbieter: "eigen", rechnungsnummer: `R-${JAHR}-0001`, lexware_status: "open", netto: 125, brutto: 148.75 });
    expect(data?.uebertragen_am).not.toBeNull();
  });

  it("die nächste Nummer zählt weiter, auch bei gleichzeitigen Aufrufen (keine doppelte, keine Lücke)", async () => {
    const ids = await Promise.all([entwurf(), entwurf(), entwurf()]);
    const antworten = await Promise.all(ids.map((id) => bueroC.rpc("rechnung_finalisieren", { p_id: id, p_netto: 10, p_brutto: 11.9 })));
    for (const a of antworten) expect(a.error).toBeNull();
    const nummern = antworten.map((a) => a.data as string).sort();
    expect(nummern).toEqual([`R-${JAHR}-0002`, `R-${JAHR}-0003`, `R-${JAHR}-0004`]);
  });

  it("eine fertige Rechnung lässt sich nicht noch einmal fertigstellen", async () => {
    const { data } = await adminClient().from("invoices").select("id").eq("rechnungsnummer", `R-${JAHR}-0001`).single();
    const r = await bueroC.rpc("rechnung_finalisieren", { p_id: data!.id, p_netto: 1, p_brutto: 1 });
    expect(r.error?.message).toContain("schon fertig");
  });

  it("ohne Position, mit Datum in der Zukunft oder ohne Beträge: abgelehnt, und es wird keine Nummer verbraucht", async () => {
    const ohne = await entwurf(`${JAHR}-03-10`, false);
    expect((await bueroC.rpc("rechnung_finalisieren", { p_id: ohne, p_netto: 1, p_brutto: 1 })).error?.message).toContain("keine Position");
    const zukunft = await entwurf("2999-01-01");
    expect((await bueroC.rpc("rechnung_finalisieren", { p_id: zukunft, p_netto: 1, p_brutto: 1 })).error?.message).toContain("Zukunft");
    const ok = await entwurf();
    expect((await bueroC.rpc("rechnung_finalisieren", { p_id: ok, p_netto: null, p_brutto: 1 })).error).not.toBeNull();
    const { data: z } = await adminClient().from("invoice_counters").select("letzte").eq("jahr", JAHR).single();
    expect(z?.letzte).toBe(4);
    const gut = await bueroC.rpc("rechnung_finalisieren", { p_id: ok, p_netto: 10, p_brutto: 11.9 });
    expect(gut.data).toBe(`R-${JAHR}-0005`);
  });

  it("das Rechnungsdatum darf nicht vor dem der letzten Rechnung des Jahres liegen", async () => {
    const spaet = await entwurf(`${JAHR}-06-01`);
    expect((await bueroC.rpc("rechnung_finalisieren", { p_id: spaet, p_netto: 10, p_brutto: 11.9 })).error).toBeNull();
    const frueh = await entwurf(`${JAHR}-05-01`);
    const r = await bueroC.rpc("rechnung_finalisieren", { p_id: frueh, p_netto: 10, p_brutto: 11.9 });
    expect(r.error?.message).toContain("nicht davor");
  });

  it("ein neues Jahr beginnt wieder bei 1, Kürzel und Startnummer kommen aus den Einstellungen", async () => {
    await adminClient().from("app_settings").upsert({ schluessel: "nummernkreise", wert: { ...(alteEinstellung as object | null), rechnung_praefix: "RE", rechnung_start: 40 } });
    const id = await entwurf(`${JAHR + 1}-01-15`);
    const r = await bueroC.rpc("rechnung_finalisieren", { p_id: id, p_netto: 10, p_brutto: 11.9 });
    expect(r.data).toBe(`RE${JAHR + 1}-0040`);
    const id2 = await entwurf(`${JAHR + 1}-01-16`);
    expect((await bueroC.rpc("rechnung_finalisieren", { p_id: id2, p_netto: 10, p_brutto: 11.9 })).data).toBe(`RE${JAHR + 1}-0041`);
  });

  it("ein Mitarbeiter darf nicht fertigstellen und sieht keine Zähler", async () => {
    const id = await entwurf();
    expect((await maC.rpc("rechnung_finalisieren", { p_id: id, p_netto: 1, p_brutto: 1 })).error).not.toBeNull();
    expect((await maC.from("invoice_counters").select("jahr")).data ?? []).toHaveLength(0);
    const { data } = await adminClient().from("invoices").select("status").eq("id", id).single();
    expect(data?.status).toBe("entwurf");
  });

  it("Büro darf die Zähler nicht selbst verändern", async () => {
    await bueroC.from("invoice_counters").update({ letzte: 1 }).eq("jahr", JAHR);
    await bueroC.from("invoice_counters").insert({ jahr: JAHR + 5, letzte: 0 });
    await bueroC.from("invoice_counters").delete().eq("jahr", JAHR);
    const { data } = await adminClient().from("invoice_counters").select("jahr, letzte").eq("jahr", JAHR);
    expect(data).toEqual([{ jahr: JAHR, letzte: 6 }]);
    expect((await adminClient().from("invoice_counters").select("jahr").eq("jahr", JAHR + 5)).data).toHaveLength(0);
  });
});

describe("Sperre und Zahlung", () => {
  it("nach dem Fertigstellen sind Inhalt und Bausteine gesperrt, die Nummer lässt sich nicht doppelt vergeben", async () => {
    const { data } = await adminClient().from("invoices").select("id").eq("rechnungsnummer", `R-${JAHR}-0001`).single();
    const geaendert = await bueroC.from("invoices").update({ betreff: "geändert" }).eq("id", data!.id);
    expect(geaendert.error?.message).toContain("gesperrt");
    const baustein = await bueroC.from("invoice_items").insert({ invoice_id: data!.id, sortierung: 9, typ: "position", kurztext: "Nachschlag", menge: 1, einheit: "Stk", einzelpreis: 1 });
    expect(baustein.error).not.toBeNull();
    const doppelt = await adminClient().from("invoices").update({ rechnungsnummer: `R-${JAHR}-0002` }).eq("id", data!.id);
    expect(doppelt.error).not.toBeNull();
  });

  it("bezahlt buchen und wieder zurücknehmen geht, der Inhalt bleibt gesperrt", async () => {
    const { data } = await adminClient().from("invoices").select("id").eq("rechnungsnummer", `R-${JAHR}-0001`).single();
    const bezahlt = await bueroC.from("invoices").update({ lexware_status: "paid", bezahlt_am: `${JAHR}-04-01` }).eq("id", data!.id).select("lexware_status");
    expect(bezahlt.error).toBeNull();
    expect(bezahlt.data?.[0]?.lexware_status).toBe("paid");
    const zurueck = await bueroC.from("invoices").update({ lexware_status: "open", bezahlt_am: null }).eq("id", data!.id).select("lexware_status");
    expect(zurueck.data?.[0]?.lexware_status).toBe("open");
  });
});
