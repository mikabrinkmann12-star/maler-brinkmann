// Angebote: Rechte (nur Büro/Admin), Sperre nach dem Versand, Prüfungen der Bausteine, Bilder-Bucket.
// Arbeitet mit eigenen Wegwerf-Daten (TEST-…), räumt am Ende alles auf.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
let projekt: string, projekt2: string;
let angebot: string, position: string, anweisung: string;
let malerFremd: TestNutzer, malerFremdC: SupabaseClient;
const bildPfade: string[] = [];

beforeAll(async () => {
  [admin, buero, maler] = await Promise.all([
    testNutzerAnlegen("admin"),
    testNutzerAnlegen("buero"),
    testNutzerAnlegen("mitarbeiter"),
  ]);
  malerFremd = await testNutzerAnlegen("mitarbeiter");
  malerFremdC = await einloggen(malerFremd.benutzername, malerFremd.passwort);
  [adminC, bueroC, malerC] = await Promise.all([
    einloggen(admin.benutzername, admin.passwort),
    einloggen(buero.benutzername, buero.passwort),
    einloggen(maler.benutzername, maler.passwort),
  ]);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: projekte } = await db
    .from("projects")
    .insert([
      { projektnummer: `${kennung}-P1`, name: `${kennung} Projekt 1`, status_id: status!.id },
      { projektnummer: `${kennung}-P2`, name: `${kennung} Projekt 2`, status_id: status!.id },
    ])
    .select("id, projektnummer");
  projekt = projekte!.find((p) => p.projektnummer.endsWith("P1"))!.id;
  projekt2 = projekte!.find((p) => p.projektnummer.endsWith("P2"))!.id;
  // Mitarbeiter ist sogar Mitglied des Projekts: Angebote sieht er trotzdem nicht
  await db.from("project_members").insert({ project_id: projekt, user_id: maler.id, added_by: buero.id });
});

afterAll(async () => {
  const db = adminClient();
  if (bildPfade.length) await db.storage.from("angebotsbilder").remove(bildPfade);
  const projekte = [projekt, projekt2].filter(Boolean);
  if (projekte.length) {
    const { data: quotes } = await db.from("quotes").select("id").in("project_id", projekte);
    const ids = (quotes ?? []).map((q) => q.id);
    if (ids.length) {
      await db.from("work_instructions").delete().in("quote_id", ids);
      await db.from("quotes").update({ status: "entwurf" }).in("id", ids); // sonst sperrt der Trigger das Löschen
      await db.from("quote_items").delete().in("quote_id", ids);
      await db.from("quotes").delete().in("id", ids);
    }
    await db.from("project_members").delete().in("project_id", projekte);
    await db.from("projects").delete().in("id", projekte);
  }
  await Promise.all([admin, buero, maler, malerFremd].map(testNutzerLoeschen));
});

describe("Angebote anlegen und lesen", () => {
  it("Büro und Admin legen Angebote an; Standardwerte stimmen", async () => {
    const a = await bueroC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} Wohnzimmer` }).select("*").single();
    expect(a.error).toBeNull();
    angebot = a.data!.id;
    expect(a.data).toMatchObject({ status: "entwurf", steuersatz: 19, reverse_charge: false, rabatt_prozent: 0, created_by: buero.id });
    const b = await adminC.from("quotes").insert({ project_id: projekt2, betreff: `${kennung} Flur` }).select("id").single();
    expect(b.error).toBeNull();
  });

  it("Mitarbeiter sehen keine Angebote, legen keine an und ändern keine (auch nicht als Projektmitglied)", async () => {
    expect((await malerC.from("quotes").select("id").eq("id", angebot)).data ?? []).toEqual([]);
    expect((await malerC.from("quotes").insert({ project_id: projekt, betreff: `${kennung} Hack` })).error).not.toBeNull();
    const upd = await malerC.from("quotes").update({ betreff: "x" }).eq("id", angebot).select("id");
    expect(upd.data ?? []).toEqual([]);
    expect((await malerC.from("quote_items").select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("quote_items").insert({ quote_id: angebot, sortierung: 0, typ: "text", langtext: "x" })).error).not.toBeNull();
  });

  it("Mitarbeiter (auch als Projektmitglied) ändern und archivieren das Projekt nicht, sehen aber Notizen", async () => {
    const db = adminClient();
    await db.from("project_notes").insert({ project_id: projekt, text: `${kennung} Notiz`, erstellt_von: buero.id });
    expect((await malerC.from("projects").update({ name: "geändert" }).eq("id", projekt).select("id")).data ?? []).toEqual([]);
    expect((await malerC.from("projects").update({ archiviert_am: new Date().toISOString() }).eq("id", projekt).select("id")).data ?? []).toEqual([]);
    const { data: notizen } = await malerC.from("project_notes").select("id").eq("project_id", projekt);
    expect(notizen).toHaveLength(1);
    await db.from("project_notes").delete().eq("project_id", projekt);
  });

  it("ohne Login geht nichts", async () => {
    expect((await anonClient().from("quotes").select("id")).data ?? []).toEqual([]);
    expect((await anonClient().from("quote_items").select("id")).data ?? []).toEqual([]);
  });

  it("niemand löscht ein Angebot (archivieren)", async () => {
    await bueroC.from("quotes").delete().eq("id", angebot);
    await adminC.from("quotes").delete().eq("id", angebot);
    const { data } = await adminClient().from("quotes").select("id").eq("id", angebot);
    expect(data).toHaveLength(1);
  });

  it("Prüfungen: Betreff, Steuersatz, Rabatt, Reverse-Charge nur ohne USt.", async () => {
    const basis = { project_id: projekt, betreff: `${kennung} X` };
    expect((await bueroC.from("quotes").insert({ ...basis, betreff: "  " })).error).not.toBeNull();
    expect((await bueroC.from("quotes").insert({ ...basis, steuersatz: 16 })).error).not.toBeNull();
    expect((await bueroC.from("quotes").insert({ ...basis, rabatt_prozent: 101 })).error).not.toBeNull();
    expect((await bueroC.from("quotes").insert({ ...basis, rabatt_prozent: -1 })).error).not.toBeNull();
    expect((await bueroC.from("quotes").insert({ ...basis, reverse_charge: true, steuersatz: 19 })).error).not.toBeNull();
    const ok = await bueroC.from("quotes").insert({ ...basis, reverse_charge: true, steuersatz: 0 }).select("id").single();
    expect(ok.error).toBeNull();
  });

  it("Zahlungsbedingungen und gültig bis: Skonto nur zusammen, Grenzen", async () => {
    const basis = { project_id: projekt, betreff: `${kennung} Zahlung` };
    const fehler = async (teil: object) => (await bueroC.from("quotes").insert({ ...basis, ...teil })).error;
    expect(await fehler({ skonto_prozent: 2 })).not.toBeNull();
    expect(await fehler({ skonto_tage: 7 })).not.toBeNull();
    expect(await fehler({ zahlungsziel_tage: -1 })).not.toBeNull();
    expect(await fehler({ zahlungsziel_tage: 366 })).not.toBeNull();
    expect(await fehler({ skonto_prozent: 21, skonto_tage: 7 })).not.toBeNull();
    expect(await fehler({ zahlungsziel_tage: 14, skonto_prozent: 2, skonto_tage: 7, gueltig_bis: "2026-11-17" })).toBeNull();
  });

  it("das Projekt eines Angebots lässt sich nicht ändern", async () => {
    const r = await bueroC.from("quotes").update({ project_id: projekt2 }).eq("id", angebot);
    expect(r.error?.code).toBe("P0001");
  });
});

describe("Bausteine", () => {
  it("Positionen, Titel, Text und Zwischensumme anlegen", async () => {
    const titel = await bueroC.from("quote_items").insert({ quote_id: angebot, sortierung: 0, typ: "titel", kurztext: "Wohnzimmer" });
    expect(titel.error).toBeNull();
    const p = await bueroC
      .from("quote_items")
      .insert({ quote_id: angebot, sortierung: 1, typ: "position", kurztext: "Wände streichen", menge: 313.63, einheit: "m²", einzelpreis: 11.8 })
      .select("id, menge, einzelpreis")
      .single();
    expect(p.error).toBeNull();
    position = p.data!.id;
    expect(Number(p.data!.menge)).toBe(313.63);
    expect(Number(p.data!.einzelpreis)).toBe(11.8);
    expect((await adminC.from("quote_items").insert({ quote_id: angebot, sortierung: 2, typ: "text", langtext: "Hinweis" })).error).toBeNull();
    expect((await adminC.from("quote_items").insert({ quote_id: angebot, sortierung: 3, typ: "zwischensumme" })).error).toBeNull();
  });

  it("unvollständige Bausteine werden abgelehnt", async () => {
    const i = (teil: object) => bueroC.from("quote_items").insert({ quote_id: angebot, sortierung: 9, ...teil });
    expect((await i({ typ: "position", kurztext: "X", einheit: "m²" })).error).not.toBeNull(); // ohne Menge/Preis
    expect((await i({ typ: "position", menge: 1, einheit: "m²", einzelpreis: 1 })).error).not.toBeNull(); // ohne Text
    expect((await i({ typ: "position", kurztext: "X", menge: 1, einheit: " ", einzelpreis: 1 })).error).not.toBeNull();
    expect((await i({ typ: "titel", kurztext: " " })).error).not.toBeNull();
    expect((await i({ typ: "text" })).error).not.toBeNull();
    expect((await i({ typ: "bild", bild_pfad: "fremd/bild.jpg" })).error).not.toBeNull(); // Pfad muss zum Angebot gehören
    expect((await i({ typ: "bild" })).error).not.toBeNull();
    expect((await i({ typ: "position", kurztext: "X", menge: 1, einheit: "m²", einzelpreis: 10_000_000 })).error).not.toBeNull();
  });

  it("Bild-Baustein braucht einen Pfad im Ordner des Angebots", async () => {
    const r = await bueroC.from("quote_items").insert({ quote_id: angebot, sortierung: 4, typ: "bild", bild_pfad: `${angebot}/foto.jpg`, kurztext: "Vorher" });
    expect(r.error).toBeNull();
  });

  it("Bausteine ändern und löschen geht im Entwurf", async () => {
    const upd = await bueroC.from("quote_items").update({ menge: 10 }).eq("id", position).select("menge").single();
    expect(Number(upd.data!.menge)).toBe(10);
    const neu = await bueroC.from("quote_items").insert({ quote_id: angebot, sortierung: 5, typ: "text", langtext: "weg damit" }).select("id").single();
    const del = await bueroC.from("quote_items").delete().eq("id", neu.data!.id).select("id");
    expect(del.data).toHaveLength(1);
  });

  it("ein Baustein lässt sich nicht in ein anderes Angebot verschieben", async () => {
    const { data: anderes } = await adminClient().from("quotes").select("id").eq("project_id", projekt2).limit(1).single();
    const r = await bueroC.from("quote_items").update({ quote_id: anderes!.id }).eq("id", position);
    expect(r.error?.code).toBe("P0001");
  });
});

describe("Sperre nach dem Versand", () => {
  it("versendet: Inhalt und Bausteine sind gesperrt, Status und Archivieren gehen weiter", async () => {
    const s = await bueroC.from("quotes").update({ status: "versendet" }).eq("id", angebot);
    expect(s.error).toBeNull();

    expect((await bueroC.from("quotes").update({ betreff: "neu" }).eq("id", angebot)).error?.code).toBe("P0001");
    expect((await bueroC.from("quotes").update({ rabatt_prozent: 5 }).eq("id", angebot)).error?.code).toBe("P0001");
    expect((await bueroC.from("quotes").update({ zahlungsziel_tage: 30 }).eq("id", angebot)).error?.code).toBe("P0001");
    expect((await bueroC.from("quotes").update({ gueltig_bis: "2026-12-31" }).eq("id", angebot)).error?.code).toBe("P0001");
    expect((await bueroC.from("quote_items").update({ menge: 11 }).eq("id", position)).error?.code).toBe("P0001");
    expect((await bueroC.from("quote_items").insert({ quote_id: angebot, sortierung: 7, typ: "text", langtext: "x" })).error?.code).toBe("P0001");
    expect((await bueroC.from("quote_items").delete().eq("id", position)).error?.code).toBe("P0001");

    expect((await bueroC.from("quotes").update({ status: "angenommen" }).eq("id", angebot)).error).toBeNull();
    expect((await bueroC.from("quotes").update({ archiviert_am: new Date().toISOString() }).eq("id", angebot)).error).toBeNull();
    expect((await bueroC.from("quotes").update({ archiviert_am: null }).eq("id", angebot)).error).toBeNull();
  });

  it("zurück auf Entwurf macht das Angebot wieder bearbeitbar", async () => {
    expect((await bueroC.from("quotes").update({ status: "entwurf" }).eq("id", angebot)).error).toBeNull();
    expect((await bueroC.from("quotes").update({ betreff: `${kennung} Wohnzimmer neu` }).eq("id", angebot)).error).toBeNull();
    expect((await bueroC.from("quote_items").update({ menge: 12 }).eq("id", position)).error).toBeNull();
  });

  it("Änderungen werden protokolliert (audit_log)", async () => {
    const { data } = await adminClient().from("audit_log").select("aktion").eq("tabelle", "quotes").eq("datensatz_id", angebot);
    expect((data ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("Bilder im Speicher (Bucket angebotsbilder)", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  it("Büro lädt hoch und liest; Mitarbeiter und Fremde können weder hochladen noch lesen", async () => {
    const pfad = `${angebot}/test-${kennung}.png`;
    bildPfade.push(pfad);
    const hoch = await bueroC.storage.from("angebotsbilder").upload(pfad, png, { contentType: "image/png" });
    expect(hoch.error).toBeNull();
    const lesen = await bueroC.storage.from("angebotsbilder").download(pfad);
    expect(lesen.error).toBeNull();

    expect((await malerC.storage.from("angebotsbilder").download(pfad)).error).not.toBeNull();
    const fremd = await malerC.storage.from("angebotsbilder").upload(`${angebot}/hack-${kennung}.png`, png, { contentType: "image/png" });
    expect(fremd.error).not.toBeNull();
    expect((await anonClient().storage.from("angebotsbilder").download(pfad)).error).not.toBeNull();
  });
});

describe("Arbeitsanweisung (ohne Preise, erst nach Freigabe für Mitarbeiter)", () => {
  it("Büro legt eine Arbeitsanweisung an; pro Angebot nur eine aktive", async () => {
    const r = await bueroC
      .from("work_instructions")
      .insert({ project_id: projekt, quote_id: angebot, titel: `${kennung} Anweisung`, inhalt: ["# Wohnzimmer", "- Wände streichen – 313,63 m²"].join("\n") })
      .select("id, freigegeben_am")
      .single();
    expect(r.error).toBeNull();
    anweisung = r.data!.id;
    expect(r.data!.freigegeben_am).toBeNull();
    const doppelt = await adminC.from("work_instructions").insert({ project_id: projekt, quote_id: angebot, titel: "Nochmal", inhalt: "x" });
    expect(doppelt.error?.code).toBe("23505");
  });

  it("Mitarbeiter (auch Projektmitglied) sehen den Entwurf nicht und können nichts anlegen oder ändern", async () => {
    expect((await malerC.from("work_instructions").select("id").eq("id", anweisung)).data ?? []).toEqual([]);
    expect((await malerC.from("work_instructions").insert({ project_id: projekt, titel: "Hack", inhalt: "x" })).error).not.toBeNull();
    const upd = await malerC.from("work_instructions").update({ inhalt: "geändert" }).eq("id", anweisung).select("id");
    expect(upd.data ?? []).toEqual([]);
  });

  it("nach der Freigabe sehen Projektmitglieder sie, Fremde nicht; ändern geht weiterhin nicht", async () => {
    expect((await bueroC.from("work_instructions").update({ freigegeben_am: new Date().toISOString() }).eq("id", anweisung)).error).toBeNull();
    const sicht = await malerC.from("work_instructions").select("id, titel, inhalt").eq("id", anweisung);
    expect(sicht.data).toHaveLength(1);
    expect(sicht.data![0].inhalt).toContain("313,63 m²");
    expect((await malerFremdC.from("work_instructions").select("id").eq("id", anweisung)).data ?? []).toEqual([]);
    const upd = await malerC.from("work_instructions").update({ inhalt: "geändert" }).eq("id", anweisung).select("id");
    expect(upd.data ?? []).toEqual([]);
    expect((await anonClient().from("work_instructions").select("id")).data ?? []).toEqual([]);
  });

  it("Mitarbeiter sehen auch dann keine Preise: das Angebot selbst bleibt unsichtbar", async () => {
    expect((await malerC.from("quotes").select("id").eq("id", angebot)).data ?? []).toEqual([]);
    expect((await malerC.from("quote_items").select("id").eq("quote_id", angebot)).data ?? []).toEqual([]);
  });

  it("archivierte Arbeitsanweisungen verschwinden für Mitarbeiter; niemand löscht", async () => {
    await bueroC.from("work_instructions").delete().eq("id", anweisung);
    expect((await adminClient().from("work_instructions").select("id").eq("id", anweisung)).data).toHaveLength(1);
    expect((await bueroC.from("work_instructions").update({ archiviert_am: new Date().toISOString() }).eq("id", anweisung)).error).toBeNull();
    expect((await malerC.from("work_instructions").select("id").eq("id", anweisung)).data ?? []).toEqual([]);
    expect((await bueroC.from("work_instructions").select("id").eq("id", anweisung)).data).toHaveLength(1);
  });
});
