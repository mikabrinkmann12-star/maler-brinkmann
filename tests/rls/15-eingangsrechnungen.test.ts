// Eingangsrechnungen: nur Büro/Admin lesen, anlegen, ändern; Mitarbeiter und Fremde nichts; kein Löschen;
// dieselbe Datei nicht doppelt; Projekt oder Bereich, nie beides; privater Speicher nur für das Büro.
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
let buero: TestNutzer, maler: TestNutzer;
let bueroC: SupabaseClient, malerC: SupabaseClient;
const angelegt: string[] = [];
const dateien: string[] = [];

function zeile(teil: Record<string, unknown> = {}) {
  const id = randomUUID();
  angelegt.push(id);
  return { id, lieferant: `${kennung} Farben GmbH`, storage_pfad: `${id}.pdf`, dateiname: "rechnung.pdf", ...teil };
}

beforeAll(async () => {
  [buero, maler] = await Promise.all([testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [bueroC, malerC] = await Promise.all([einloggen(buero.benutzername, buero.passwort), einloggen(maler.benutzername, maler.passwort)]);
});

afterAll(async () => {
  const a = adminClient();
  if (dateien.length) await a.storage.from("eingangsrechnungen").remove(dateien);
  await a.from("incoming_invoices").delete().in("id", angelegt);
  await Promise.all([buero, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Eingangsrechnungen (Tabelle)", () => {
  it("Büro legt an, liest und ändert; Ersteller und Bearbeiter setzt die Datenbank", async () => {
    const z = zeile({ brutto: 119, netto: 100 });
    const neu = await bueroC.from("incoming_invoices").insert(z).select("id, erstellt_von, bearbeitet_von, zu_pruefen, zahlstatus").single();
    expect(neu.error).toBeNull();
    expect(neu.data).toMatchObject({ erstellt_von: buero.id, bearbeitet_von: buero.id, zu_pruefen: true, zahlstatus: "offen" });
    const gelesen = await bueroC.from("incoming_invoices").select("brutto").eq("id", z.id).single();
    expect(Number(gelesen.data?.brutto)).toBe(119);
    const geaendert = await bueroC.from("incoming_invoices").update({ zu_pruefen: false, zahlstatus: "bezahlt", bezahlt_am: "2026-03-01" }).eq("id", z.id).select("id");
    expect(geaendert.data).toHaveLength(1);
  });

  it("Mitarbeiter und Fremde sehen und ändern nichts und legen nichts an", async () => {
    const z = zeile();
    await bueroC.from("incoming_invoices").insert(z);
    expect((await malerC.from("incoming_invoices").select("id").eq("id", z.id)).data ?? []).toEqual([]);
    expect((await anonClient().from("incoming_invoices").select("id").eq("id", z.id)).data ?? []).toEqual([]);
    expect((await malerC.from("incoming_invoices").update({ lieferant: "x" }).eq("id", z.id).select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("incoming_invoices").insert(zeile())).error).not.toBeNull();
  });

  it("niemand löscht (nur archivieren)", async () => {
    const z = zeile();
    await bueroC.from("incoming_invoices").insert(z);
    const weg = await bueroC.from("incoming_invoices").delete().eq("id", z.id).select("id");
    expect(weg.data ?? []).toEqual([]);
    const noch = await adminClient().from("incoming_invoices").select("id").eq("id", z.id);
    expect(noch.data).toHaveLength(1);
    const archiv = await bueroC.from("incoming_invoices").update({ archiviert_am: new Date().toISOString() }).eq("id", z.id).select("id");
    expect(archiv.data).toHaveLength(1);
  });

  it("dieselbe Datei (Hash) gibt es nur einmal aktiv, nach dem Archivieren wieder", async () => {
    const hash = randomBytes(32).toString("hex");
    const a = zeile({ datei_hash: hash });
    const b = zeile({ datei_hash: hash });
    expect((await bueroC.from("incoming_invoices").insert(a)).error).toBeNull();
    const doppelt = await bueroC.from("incoming_invoices").insert(b);
    expect(doppelt.error?.code).toBe("23505");
    await bueroC.from("incoming_invoices").update({ archiviert_am: new Date().toISOString() }).eq("id", a.id);
    expect((await bueroC.from("incoming_invoices").insert(b)).error).toBeNull();
  });

  it("Projekt oder Bereich, nie beides; Bereich nur aus der Liste", async () => {
    const { data: projekt } = await adminClient().from("projects").select("id").limit(1).single();
    expect(projekt).not.toBeNull();
    const beides = await bueroC.from("incoming_invoices").insert(zeile({ project_id: projekt!.id, bereich: "lager" }));
    expect(beides.error).not.toBeNull();
    const falsch = await bueroC.from("incoming_invoices").insert(zeile({ bereich: "garage" }));
    expect(falsch.error).not.toBeNull();
    const nurBereich = await bueroC.from("incoming_invoices").insert(zeile({ bereich: "lager" }));
    expect(nurBereich.error).toBeNull();
    const nurProjekt = await bueroC.from("incoming_invoices").insert(zeile({ project_id: projekt!.id }));
    expect(nurProjekt.error).toBeNull();
  });

  it("Herkunft der Felder: „ki“ ist erlaubt (KI-Auslesen), unbekannte Werte nicht", async () => {
    for (const herkunft of ["e-rechnung", "pdf-text", "ki", "keine"]) {
      expect((await bueroC.from("incoming_invoices").insert({ ...zeile(), erkannt_aus: herkunft })).error, herkunft).toBeNull();
    }
    expect((await bueroC.from("incoming_invoices").insert({ ...zeile(), erkannt_aus: "orakel" })).error).not.toBeNull();
  });

  it("„Bezahlt am“ nur bei bezahlt", async () => {
    const r = await bueroC.from("incoming_invoices").insert(zeile({ zahlstatus: "offen", bezahlt_am: "2026-03-01" }));
    expect(r.error).not.toBeNull();
  });
});

describe("Eingangsrechnungen (Speicher)", () => {
  it("Büro lädt hoch und liest, Mitarbeiter nicht", async () => {
    const pfad = `${randomUUID()}.pdf`;
    dateien.push(pfad);
    const inhalt = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
    const hoch = await bueroC.storage.from("eingangsrechnungen").upload(pfad, inhalt, { contentType: "application/pdf" });
    expect(hoch.error).toBeNull();
    expect((await bueroC.storage.from("eingangsrechnungen").download(pfad)).error).toBeNull();
    expect((await malerC.storage.from("eingangsrechnungen").download(pfad)).error).not.toBeNull();
    const fremdHoch = await malerC.storage.from("eingangsrechnungen").upload(`${randomUUID()}.pdf`, inhalt, { contentType: "application/pdf" });
    expect(fremdHoch.error).not.toBeNull();
    // Kein Überschreiben und kein Löschen über die App
    expect((await bueroC.storage.from("eingangsrechnungen").upload(pfad, inhalt, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    await bueroC.storage.from("eingangsrechnungen").remove([pfad]);
    expect((await adminClient().storage.from("eingangsrechnungen").download(pfad)).error).toBeNull();
  });

  it("andere Dateitypen werden abgelehnt", async () => {
    const r = await bueroC.storage.from("eingangsrechnungen").upload(`${randomUUID()}.docx`, new Blob(["x"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(r.error).not.toBeNull();
  });
});
