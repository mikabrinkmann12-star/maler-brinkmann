// Rechnungen: Rechte (nur Büro/Admin), Sperre nach der Übertragung, Prüfungen, PDF-Bucket.
// Arbeitet mit eigenen Wegwerf-Daten (TEST-…), räumt am Ende alles auf.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

let admin: TestNutzer, buero: TestNutzer, maler: TestNutzer;
let adminC: SupabaseClient, bueroC: SupabaseClient, malerC: SupabaseClient;
let projekt: string, kunde: string, rechnung: string, position: string;
const pdfPfade: string[] = [];

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([testNutzerAnlegen("admin"), testNutzerAnlegen("buero"), testNutzerAnlegen("mitarbeiter")]);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
  const db = adminClient();
  const { data: k } = await db.from("contacts").insert({ typ: "firma", firmenname: `${kennung} Kunde`, kundennummer: `${kennung}-K` }).select("id").single();
  kunde = k!.id;
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Auftrag erteilt").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P`, name: `${kennung} Projekt`, status_id: status!.id, contact_id: kunde }).select("id").single();
  projekt = p!.id;
  await db.from("project_members").insert({ project_id: projekt, user_id: maler.id, added_by: buero.id });
});

afterAll(async () => {
  const db = adminClient();
  if (pdfPfade.length) await db.storage.from("rechnungen").remove(pdfPfade);
  if (projekt) {
    const { data: r } = await db.from("invoices").select("id, status").eq("project_id", projekt);
    for (const x of r ?? []) {
      if (x.status === "entwurf") {
        await db.from("invoice_items").delete().eq("invoice_id", x.id);
        await db.from("invoices").delete().eq("id", x.id);
      } else {
        // Übertragene Rechnungen sind gesperrt und nicht löschbar: vom Test-Nutzer lösen und archivieren
        await db.from("invoices").update({ created_by: null, archiviert_am: new Date().toISOString() }).eq("id", x.id);
      }
    }
    const { data: uebrig } = await db.from("invoices").select("id").eq("project_id", projekt);
    if (uebrig?.length) {
      // Gesperrte Reste: Projekt und Kunde bleiben (archiviert), damit die Fremdschlüssel halten
      await db.from("projects").update({ archiviert_am: new Date().toISOString() }).eq("id", projekt);
      await db.from("contacts").update({ archiviert_am: new Date().toISOString() }).eq("id", kunde);
    } else {
      await db.from("project_members").delete().eq("project_id", projekt);
      await db.from("projects").delete().eq("id", projekt);
      await db.from("contacts").delete().eq("id", kunde);
    }
  }
  await Promise.all([admin, buero, maler].map((n) => testNutzerLoeschen(n)));
});

describe("Rechnungen anlegen und lesen", () => {
  it("Büro und Admin legen eine Rechnung an; Standardwerte stimmen", async () => {
    const r = await bueroC.from("invoices").insert({ project_id: projekt, contact_id: kunde, betreff: `${kennung} Rechnung` }).select("*").single();
    expect(r.error).toBeNull();
    rechnung = r.data!.id;
    expect(r.data).toMatchObject({ status: "entwurf", steuersatz: 19, reverse_charge: false, rabatt_prozent: 0, zahlungsziel_tage: 14, lexware_id: null, rechnungsnummer: null });
    expect((await adminC.from("invoices").insert({ project_id: projekt, contact_id: kunde, betreff: `${kennung} Zweite` })).error).toBeNull();
  });

  it("Mitarbeiter (auch als Projektmitglied) sehen und ändern nichts; ohne Login geht nichts", async () => {
    expect((await malerC.from("invoices").select("id").eq("id", rechnung)).data ?? []).toEqual([]);
    expect((await malerC.from("invoices").insert({ project_id: projekt, contact_id: kunde, betreff: "Hack" })).error).not.toBeNull();
    expect((await malerC.from("invoices").update({ betreff: "x" }).eq("id", rechnung).select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("invoice_items").select("id")).data ?? []).toEqual([]);
    expect((await anonClient().from("invoices").select("id")).data ?? []).toEqual([]);
  });

  it("niemand löscht eine Rechnung", async () => {
    await bueroC.from("invoices").delete().eq("id", rechnung);
    await adminC.from("invoices").delete().eq("id", rechnung);
    expect((await adminClient().from("invoices").select("id").eq("id", rechnung)).data).toHaveLength(1);
  });

  it("Prüfungen: Steuer, Rabatt, Reverse-Charge, Skonto nur zusammen, Leistungszeitraum, Zahlungsziel", async () => {
    const basis = { project_id: projekt, contact_id: kunde, betreff: `${kennung} X` };
    const fehler = async (teil: object) => (await bueroC.from("invoices").insert({ ...basis, ...teil })).error;
    expect(await fehler({ steuersatz: 16 })).not.toBeNull();
    expect(await fehler({ rabatt_prozent: 101 })).not.toBeNull();
    expect(await fehler({ reverse_charge: true, steuersatz: 19 })).not.toBeNull();
    expect(await fehler({ skonto_prozent: 2 })).not.toBeNull();
    expect(await fehler({ leistung_von: "2026-10-10", leistung_bis: "2026-10-01" })).not.toBeNull();
    expect(await fehler({ zahlungsziel_tage: -1 })).not.toBeNull();
    expect(await fehler({ betreff: " " })).not.toBeNull();
    expect(await fehler({ skonto_prozent: 2, skonto_tage: 7, reverse_charge: true, steuersatz: 0 })).toBeNull();
  });

  it("Projekt, Kunde und Angebot einer Rechnung ändern sich nie", async () => {
    const { data: anderer } = await adminClient().from("contacts").insert({ typ: "privat", nachname: `${kennung} Anderer`, kundennummer: `${kennung}-K2` }).select("id").single();
    const r = await bueroC.from("invoices").update({ contact_id: anderer!.id }).eq("id", rechnung);
    expect(r.error?.code).toBe("P0001");
    await adminClient().from("contacts").delete().eq("id", anderer!.id);
  });
});

describe("Positionen", () => {
  it("Position und Textzeile anlegen, ändern, löschen (im Entwurf)", async () => {
    const p = await bueroC.from("invoice_items").insert({ invoice_id: rechnung, sortierung: 0, typ: "position", kurztext: "Wände", menge: 313.63, einheit: "m²", einzelpreis: 11.8 }).select("id").single();
    expect(p.error).toBeNull();
    position = p.data!.id;
    expect((await adminC.from("invoice_items").insert({ invoice_id: rechnung, sortierung: 1, typ: "text", kurztext: "Wohnzimmer" })).error).toBeNull();
    expect((await bueroC.from("invoice_items").update({ menge: 300 }).eq("id", position)).error).toBeNull();
    const weg = await bueroC.from("invoice_items").insert({ invoice_id: rechnung, sortierung: 2, typ: "text", langtext: "weg" }).select("id").single();
    expect((await bueroC.from("invoice_items").delete().eq("id", weg.data!.id).select("id")).data).toHaveLength(1);
  });

  it("unvollständige Positionen werden abgelehnt", async () => {
    const i = (teil: object) => bueroC.from("invoice_items").insert({ invoice_id: rechnung, sortierung: 9, ...teil });
    expect((await i({ typ: "position", kurztext: "X", einheit: "m²" })).error).not.toBeNull();
    expect((await i({ typ: "position", menge: 1, einheit: "m²", einzelpreis: 1 })).error).not.toBeNull();
    expect((await i({ typ: "position", kurztext: "X", menge: 1, einheit: " ", einzelpreis: 1 })).error).not.toBeNull();
    expect((await i({ typ: "text" })).error).not.toBeNull();
    expect((await i({ typ: "position", kurztext: "X", menge: 1, einheit: "m", einzelpreis: 10_000_000 })).error).not.toBeNull();
  });
});

describe("Sperre nach der Übertragung an Lexware", () => {
  it("während der Übertragung und danach ist der Inhalt gesperrt, die Lexware-Felder lassen sich setzen", async () => {
    // Diese Rechnung bleibt am Ende gesperrt zurück (nicht löschbar), deshalb gehört sie keinem Test-Nutzer (created_by leer).
    const gesperrt = await adminClient().from("invoices").insert({ project_id: projekt, contact_id: kunde, betreff: `${kennung} Sperre`, created_by: null }).select("id").single();
    expect(gesperrt.error).toBeNull();
    rechnung = gesperrt.data!.id;
    const p = await adminClient().from("invoice_items").insert({ invoice_id: rechnung, sortierung: 0, typ: "position", kurztext: "Wände", menge: 1, einheit: "m²", einzelpreis: 10 }).select("id").single();
    position = p.data!.id;
    expect((await bueroC.from("invoices").update({ status: "wird_uebertragen" }).eq("id", rechnung)).error).toBeNull();
    expect((await bueroC.from("invoices").update({ betreff: "neu" }).eq("id", rechnung)).error?.code).toBe("P0001");
    expect((await bueroC.from("invoice_items").update({ menge: 1 }).eq("id", position)).error?.code).toBe("P0001");

    const lexwareId = crypto.randomUUID();
    const r = await bueroC.from("invoices").update({ status: "uebertragen", lexware_id: lexwareId, uebertragen_am: new Date().toISOString() }).eq("id", rechnung);
    expect(r.error).toBeNull();
    expect((await bueroC.from("invoices").update({ rechnungsnummer: "RE1019", lexware_status: "open", netto: 100, brutto: 119, abgeglichen_am: new Date().toISOString() }).eq("id", rechnung)).error).toBeNull();

    expect((await bueroC.from("invoices").update({ rabatt_prozent: 5 }).eq("id", rechnung)).error?.code).toBe("P0001");
    expect((await bueroC.from("invoices").update({ schlusstext: "x" }).eq("id", rechnung)).error?.code).toBe("P0001");
    expect((await bueroC.from("invoice_items").insert({ invoice_id: rechnung, sortierung: 5, typ: "text", langtext: "x" })).error?.code).toBe("P0001");
    expect((await bueroC.from("invoice_items").delete().eq("id", position)).error?.code).toBe("P0001");
  });

  it("eine übertragene Rechnung wird nie wieder zum Entwurf; die Lexware-ID ist eindeutig", async () => {
    expect((await bueroC.from("invoices").update({ status: "entwurf" }).eq("id", rechnung)).error?.code).toBe("P0001");
    const { data: lex } = await adminClient().from("invoices").select("lexware_id").eq("id", rechnung).single();
    const zweite = await bueroC.from("invoices").insert({ project_id: projekt, contact_id: kunde, betreff: `${kennung} Dublette`, lexware_id: lex!.lexware_id });
    expect(zweite.error?.code).toBe("23505");
  });

  it("Änderungen werden protokolliert", async () => {
    const { data } = await adminClient().from("audit_log").select("aktion").eq("tabelle", "invoices").eq("datensatz_id", rechnung);
    expect((data ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("PDF-Kopien (Bucket rechnungen)", () => {
  it("Büro lädt hoch und liest, Mitarbeiter und Fremde nicht; nur PDF erlaubt", async () => {
    const pfad = `${rechnung}.pdf`;
    pdfPfade.push(pfad);
    expect((await bueroC.storage.from("rechnungen").upload(pfad, pdf, { contentType: "application/pdf", upsert: true })).error).toBeNull();
    expect((await bueroC.storage.from("rechnungen").download(pfad)).error).toBeNull();
    expect((await adminC.storage.from("rechnungen").download(pfad)).error).toBeNull();
    expect((await malerC.storage.from("rechnungen").download(pfad)).error).not.toBeNull();
    expect((await anonClient().storage.from("rechnungen").download(pfad)).error).not.toBeNull();
    expect((await malerC.storage.from("rechnungen").upload(`${rechnung}-x.pdf`, pdf, { contentType: "application/pdf" })).error).not.toBeNull();
    expect((await bueroC.storage.from("rechnungen").upload(`${rechnung}.txt`, new Uint8Array([1]), { contentType: "text/plain" })).error).not.toBeNull();
  });
});
