// Rechnungen über sevdesk: der ganze Ablauf (übertragen, abgleichen, per E-Mail senden, bezahlt buchen, mahnen, stornieren) gegen die Datenbank
// (dev) und einen Schein-Server für sevdesk. So ist alles geprüft, was die App tut; ob sevdesk selbst die Daten genauso annimmt, zeigt erst
// ein echtes Konto. Arbeitet mit Wegwerf-Daten (TEST-…) und räumt am Ende auf.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RechnungDetail } from "@/lib/rechnung-daten";
import { erzeugeSevdeskClient } from "@/lib/sevdesk-client";
import { sevdeskAbgleichen, sevdeskBezahltBuchen, sevdeskMahnen, sevdeskPerMail, sevdeskStornieren, sevdeskUebertragen } from "@/lib/sevdesk-uebertragung";
import { adminClient, einloggen, testNutzerAnlegen, testNutzerLoeschen, type TestNutzer } from "./hilfen";

const kennung = `TEST-${randomBytes(3).toString("hex")}`;

type Rechnung = { id: string; status: string; nummer: string; pos: { quantity: number; price: number; taxRate: number }[]; mails: { id: string; body: Record<string, unknown> }[]; bezahlt: boolean; storniert: boolean; festgeschrieben: boolean; typ: string };

/** Kleiner Nachbau von sevdesk: merkt sich Rechnungen und deren Status. */
function scheinSevdesk() {
  // Zufälliger Anfang, damit die sevdesk-IDs aus früheren Läufen (übertragene Rechnungen bleiben in der Datenbank) nie kollidieren
  let zaehler = 100_000 + Math.floor(Math.random() * 800_000);
  const rechnungen = new Map<string, Rechnung>();
  const kontakte: Record<string, unknown>[] = [];
  const aufrufe: string[] = [];
  const antwort = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: { "content-type": "application/json" } });

  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const m = init?.method ?? "GET";
    const pfad = u.pathname.replace("/api/v1", "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    aufrufe.push(`${m} ${pfad}`);
    if (m === "GET" && pfad === "/SevUser") return antwort({ objects: [{ id: "77", firstName: "Ralf", lastName: "Brinkmann" }] });
    if (m === "GET" && pfad === "/Unity") return antwort({ objects: [{ id: "1", name: "Stk" }, { id: "4", name: "m²" }] });
    if (m === "GET" && pfad === "/CheckAccount") return antwort({ objects: [{ id: "11", status: "100" }] });
    if (m === "POST" && pfad === "/Contact") {
      kontakte.push(body);
      return antwort({ objects: { id: String(zaehler + 5_000_000 + kontakte.length) } }, 201);
    }
    if (m === "POST" && (pfad === "/ContactAddress" || pfad === "/CommunicationWay")) return antwort({ objects: { id: "1" } }, 201);
    if (m === "POST" && pfad === "/Invoice/Factory/saveInvoice") {
      const id = String(++zaehler);
      rechnungen.set(id, {
        id,
        status: "100",
        nummer: "",
        typ: "RE",
        pos: body.invoicePosSave.map((p: { quantity: number; price: number; taxRate: number }) => ({ quantity: p.quantity, price: p.price, taxRate: p.taxRate })),
        mails: [],
        bezahlt: false,
        storniert: false,
        festgeschrieben: false,
      });
      return antwort({ objects: { invoice: { id }, invoicePos: [] } }, 201);
    }
    if (m === "POST" && pfad === "/Invoice/Factory/createInvoiceReminder") {
      const id = String(++zaehler);
      rechnungen.set(id, { id, status: "100", nummer: "MA-1", typ: "MA", pos: [], mails: [], bezahlt: false, storniert: false, festgeschrieben: false });
      return antwort({ objects: { id } });
    }
    const treffer = /^\/Invoice\/(\d+)(\/\w+)?$/.exec(pfad);
    if (treffer) {
      const r = rechnungen.get(treffer[1]);
      if (!r) return antwort({ error: { message: "nicht gefunden" } }, 404);
      const aktion = treffer[2];
      if (m === "GET" && !aktion) {
        const netto = r.pos.reduce((s, p) => s + p.quantity * p.price, 0);
        const brutto = r.pos.reduce((s, p) => s + p.quantity * p.price * (1 + p.taxRate / 100), 0);
        return antwort({ objects: [{ id: r.id, invoiceNumber: r.nummer, status: r.status, sumNet: netto.toFixed(2), sumGross: brutto.toFixed(2), enshrined: r.festgeschrieben ? "2026-10-20 10:00:00" : null }] });
      }
      if (m === "PUT" && aktion === "/sendBy") {
        r.status = "200";
        r.nummer ||= `RE-${r.id}`;
        return antwort({ objects: {} });
      }
      if (m === "PUT" && aktion === "/enshrine") {
        if (r.status === "100") return antwort({ error: { message: "nur offene Rechnungen" } }, 422);
        r.festgeschrieben = true;
        return antwort({ objects: null });
      }
      if (m === "GET" && aktion === "/getPdf") {
        if (r.status === "100") return antwort({ error: { message: "erst versenden" } }, 400);
        return antwort({ objects: { filename: `${r.nummer}.pdf`, mimeType: "application/pdf", base64encoded: true, content: Buffer.from("%PDF-1.4 schein").toString("base64") } });
      }
      if (m === "POST" && aktion === "/sendViaEmail") {
        r.mails.push({ id: r.id, body });
        if (r.status === "100") {
          r.status = "200";
          r.nummer ||= `RE-${r.id}`;
        }
        return antwort({ objects: {} }, 201);
      }
      if (m === "PUT" && aktion === "/bookAmount") {
        r.status = "1000";
        r.bezahlt = true;
        return antwort({ objects: {} });
      }
      if (m === "POST" && aktion === "/cancelInvoice") {
        r.storniert = true;
        return antwort({ objects: { id: String(++zaehler) } });
      }
    }
    return antwort({ error: { message: `unbekannt: ${m} ${pfad}` } }, 404);
  }) as typeof fetch;

  const client = erzeugeSevdeskClient({ token: "t".repeat(32), basis: "https://schein.test/api/v1", fetchFn, abstandMs: 0, warte: async () => {} });
  return { client, rechnungen, kontakte, aufrufe };
}

let buero: TestNutzer;
let bueroC: SupabaseClient;
let projekt = "", kontakt = "", rechnungId = "";
const alleRechnungen: string[] = [];

async function neueRechnung(): Promise<string> {
  const db = adminClient();
  const { data: r, error } = await db
    .from("invoices")
    .insert({ project_id: projekt, contact_id: kontakt, betreff: `${kennung} Wohnzimmer`, rechnungsdatum: "2026-10-10", leistung_von: "2026-10-05", leistung_bis: "2026-10-09", zahlungsziel_tage: 14, created_by: buero.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db.from("invoice_items").insert([
    { invoice_id: r.id, sortierung: 0, typ: "position", kurztext: "Wände streichen", menge: 40, einheit: "m²", einzelpreis: 12.5 },
    { invoice_id: r.id, sortierung: 1, typ: "position", kurztext: "Farbe", menge: 2, einheit: "Eimer", einzelpreis: 40 },
  ]);
  alleRechnungen.push(r.id);
  return r.id;
}

/** Was `rechnungLaden` in der App liefert, hier aus den Tabellen zusammengesetzt (rechnungLaden braucht die Anmeldung per Cookie). */
async function detail(id: string): Promise<RechnungDetail> {
  const { data: r } = await bueroC.from("invoices").select("*").eq("id", id).single();
  const { data: items } = await bueroC.from("invoice_items").select("*").eq("invoice_id", id).order("sortierung");
  const { data: k } = await bueroC.from("contacts").select("*").eq("id", r!.contact_id).single();
  const { data: mahn } = await bueroC.from("invoice_reminders").select("*").eq("invoice_id", id);
  return {
    rechnung: {
      id: r!.id, projectId: r!.project_id, quoteId: null, contactId: r!.contact_id, status: r!.status, betreff: r!.betreff, rechnungsdatum: r!.rechnungsdatum,
      leistungVon: r!.leistung_von, leistungBis: r!.leistung_bis, zahlungszielTage: r!.zahlungsziel_tage, skontoProzent: null, skontoTage: null,
      steuersatz: Number(r!.steuersatz), reverseCharge: r!.reverse_charge, rabattProzent: Number(r!.rabatt_prozent), einleitung: "", schlusstext: "",
      anbieter: r!.anbieter === "sevdesk" ? "sevdesk" : "lexware", lexwareId: r!.lexware_id, sevdeskId: r!.sevdesk_id, versendetAm: r!.versendet_am, versendetAn: r!.versendet_an,
      bezahltAm: r!.bezahlt_am, storniertAm: r!.storniert_am, rechnungsnummer: r!.rechnungsnummer ?? "", lexwareStatus: r!.lexware_status ?? "",
      netto: r!.netto === null ? null : Number(r!.netto), brutto: r!.brutto === null ? null : Number(r!.brutto), uebertragenAm: r!.uebertragen_am, abgeglichenAm: r!.abgeglichen_am,
      pdfPfad: r!.pdf_pfad, archiviert: r!.archiviert_am !== null, mahnstufe: r!.mahnstufe, angemahntAm: r!.angemahnt_am, notiz: "",
    },
    bausteine: (items ?? []).map((i) => ({ id: i.id, typ: i.typ, kurztext: i.kurztext ?? "", langtext: i.langtext ?? "", menge: i.menge === null ? null : Number(i.menge), einheit: i.einheit ?? "", einzelpreis: i.einzelpreis === null ? null : Number(i.einzelpreis) })),
    projekt: { id: projekt, name: "", projektnummer: "", adresse: "" },
    kunde: { id: kontakt, name: kennung, kundennummer: k!.kundennummer ?? "", lexwareKontaktId: k!.lexware_contact_id, sevdeskKontaktId: k!.sevdesk_contact_id, email: k!.email ?? "", leitwegId: k!.leitweg_id ?? "", anschrift: [] },
    angebot: null,
    mahnungen: (mahn ?? []).map((m) => ({ id: m.id, stufe: m.stufe, versendetAn: m.versendet_an, versendetAm: m.versendet_am, erstelltAm: m.created_at })),
  };
}

beforeAll(async () => {
  buero = await testNutzerAnlegen("buero");
  bueroC = await einloggen(buero.benutzername, buero.passwort);
  const db = adminClient();
  const { data: status } = await db.from("project_statuses").select("id").eq("name", "Angebot").single();
  const { data: p } = await db.from("projects").insert({ projektnummer: `${kennung}-P1`, name: `${kennung} Projekt`, status_id: status!.id }).select("id").single();
  projekt = p!.id;
  const { data: k } = await db.from("contacts").insert({ typ: "firma", firmenname: `${kennung} GmbH`, strasse: "Hauptstr. 1", plz: "26683", ort: "Saterland", email: "kunde@example.com", kundennummer: `${kennung}-K` }).select("id").single();
  kontakt = k!.id;
});

afterAll(async () => {
  const db = adminClient();
  const { data: pdf } = await db.from("invoices").select("pdf_pfad").in("id", alleRechnungen);
  const pfade = (pdf ?? []).map((x) => x.pdf_pfad).filter((x): x is string => Boolean(x));
  if (pfade.length) await db.storage.from("rechnungen").remove(pfade);
  // Übertragene Rechnungen sind gesperrt und nicht löschbar: vom Test-Nutzer lösen und archivieren (Projekt und Kunde bleiben dann archiviert)
  let uebrig = 0;
  for (const id of alleRechnungen) {
    const { data: x } = await db.from("invoices").select("status").eq("id", id).maybeSingle();
    if (!x) continue;
    if (x.status === "entwurf") {
      await db.from("invoice_items").delete().eq("invoice_id", id);
      await db.from("invoice_reminders").delete().eq("invoice_id", id);
      await db.from("invoices").delete().eq("id", id);
    } else {
      uebrig++;
      await db.from("invoice_reminders").update({ created_by: null }).eq("invoice_id", id);
      await db.from("invoices").update({ created_by: null, archiviert_am: new Date().toISOString() }).eq("id", id);
    }
  }
  if (uebrig) {
    if (projekt) await db.from("projects").update({ archiviert_am: new Date().toISOString() }).eq("id", projekt);
    if (kontakt) await db.from("contacts").update({ archiviert_am: new Date().toISOString() }).eq("id", kontakt);
  } else {
    if (kontakt) await db.from("contacts").delete().eq("id", kontakt);
    if (projekt) await db.from("projects").delete().eq("id", projekt);
  }
  await testNutzerLoeschen(buero);
});

describe("Rechnung über sevdesk", () => {
  const sev = scheinSevdesk();

  it("übertragen: Kunde anlegen, Entwurf, versenden, festschreiben, Nummer und Datei zurück", async () => {
    rechnungId = await neueRechnung();
    const r = await sevdeskUebertragen(bueroC, sev.client, await detail(rechnungId), true);
    expect(r.fehler).toBeUndefined();
    expect(r.hinweis).toBeUndefined();
    const { data } = await adminClient().from("invoices").select("*").eq("id", rechnungId).single();
    expect(data).toMatchObject({ status: "uebertragen", anbieter: "sevdesk", lexware_status: "open", netto: 580, brutto: 690.2, lexware_id: null });
    expect(data!.sevdesk_id).toMatch(/^\d+$/);
    expect(data!.rechnungsnummer).toMatch(/^RE-/);
    expect(data!.pdf_pfad).toBe(`${rechnungId}.pdf`);
    const { data: kunde } = await adminClient().from("contacts").select("sevdesk_contact_id").eq("id", kontakt).single();
    expect(kunde!.sevdesk_contact_id).toMatch(/^\d+$/);
    expect(sev.rechnungen.get(data!.sevdesk_id!)?.festgeschrieben).toBe(true);
    const datei = await bueroC.storage.from("rechnungen").download(`${rechnungId}.pdf`);
    expect(await datei.data!.text()).toContain("%PDF");
  });

  it("zweites Übertragen wird abgelehnt, nichts entsteht doppelt", async () => {
    const vorher = sev.rechnungen.size;
    const r = await sevdeskUebertragen(bueroC, sev.client, await detail(rechnungId), true);
    expect(r.fehler).toContain("schon übertragen");
    expect(sev.rechnungen.size).toBe(vorher);
  });

  it("zweite Rechnung desselben Kunden legt den Kunden nicht noch einmal an", async () => {
    const id = await neueRechnung();
    expect((await sevdeskUebertragen(bueroC, sev.client, await detail(id), true)).fehler).toBeUndefined();
    expect(sev.kontakte).toHaveLength(1);
  });

  it("Test-Modus (nur Entwurf): keine Nummer, kein Versand, Hinweis", async () => {
    const id = await neueRechnung();
    const r = await sevdeskUebertragen(bueroC, sev.client, await detail(id), false);
    expect(r.hinweis).toContain("Test-Modus");
    const { data } = await adminClient().from("invoices").select("lexware_status, rechnungsnummer, pdf_pfad").eq("id", id).single();
    expect(data).toMatchObject({ lexware_status: "draft", rechnungsnummer: null, pdf_pfad: null });
  });

  it("abgleichen holt Zahlungen, die in sevdesk gebucht wurden", async () => {
    const d = await detail(rechnungId);
    sev.rechnungen.get(d.rechnung.sevdeskId!)!.status = "1000";
    expect((await sevdeskAbgleichen(bueroC, sev.client, d)).fehler).toBeUndefined();
    const { data } = await adminClient().from("invoices").select("lexware_status, bezahlt_am").eq("id", rechnungId).single();
    expect(data!.lexware_status).toBe("paid");
    expect(data!.bezahlt_am).not.toBeNull();
    sev.rechnungen.get(d.rechnung.sevdeskId!)!.status = "200";
    await sevdeskAbgleichen(bueroC, sev.client, await detail(rechnungId));
  });

  it("per E-Mail senden: Mail geht über sevdesk, Vermerk steht in der Rechnung", async () => {
    const d = await detail(rechnungId);
    const r = await sevdeskPerMail(bueroC, sev.client, d, { an: "kunde@example.com", betreff: "Rechnung", text: "Anbei Ihre Rechnung." });
    expect(r.fehler).toBeUndefined();
    expect(sev.rechnungen.get(d.rechnung.sevdeskId!)!.mails[0].body).toMatchObject({ toEmail: "kunde@example.com", subject: "Rechnung", text: "Anbei Ihre Rechnung." });
    const { data } = await adminClient().from("invoices").select("versendet_an, versendet_am").eq("id", rechnungId).single();
    expect(data!.versendet_an).toBe("kunde@example.com");
    expect(data!.versendet_am).not.toBeNull();
  });

  it("mahnen: Zahlungserinnerung anlegen, senden, Mahnstufe steigt; dieselbe Stufe nicht noch einmal", async () => {
    const mail = { an: "kunde@example.com", betreff: "Zahlungserinnerung", text: "Bitte zahlen." };
    const r = await sevdeskMahnen(bueroC, sev.client, await detail(rechnungId), 1, mail);
    expect(r.fehler).toBeUndefined();
    const { data } = await adminClient().from("invoices").select("mahnstufe, angemahnt_am").eq("id", rechnungId).single();
    expect(data!.mahnstufe).toBe(1);
    expect(data!.angemahnt_am).not.toBeNull();
    const { data: m } = await adminClient().from("invoice_reminders").select("stufe, versendet_an, sevdesk_id").eq("invoice_id", rechnungId);
    expect(m).toHaveLength(1);
    expect(m![0]).toMatchObject({ stufe: 1, versendet_an: "kunde@example.com" });
    expect((await sevdeskMahnen(bueroC, sev.client, await detail(rechnungId), 1, mail)).fehler).toContain("schon erledigt");
    expect((await sevdeskMahnen(bueroC, sev.client, await detail(rechnungId), 2, mail)).fehler).toBeUndefined();
  });

  it("als bezahlt buchen: Konto und Betrag gehen an sevdesk, Rechnung gilt als bezahlt", async () => {
    const d = await detail(rechnungId);
    const r = await sevdeskBezahltBuchen(bueroC, sev.client, d, "2026-10-19");
    expect(r.fehler).toBeUndefined();
    const { data } = await adminClient().from("invoices").select("lexware_status, bezahlt_am").eq("id", rechnungId).single();
    expect(data).toMatchObject({ lexware_status: "paid", bezahlt_am: "2026-10-19" });
    expect((await sevdeskBezahltBuchen(bueroC, sev.client, await detail(rechnungId), "2026-10-19")).fehler).toContain("schon bezahlt");
    expect((await sevdeskMahnen(bueroC, sev.client, await detail(rechnungId), 3, { an: "k@x.de", betreff: "x", text: "y" })).fehler).toContain("offen");
  });

  it("stornieren: Stornorechnung in sevdesk, Rechnung gilt als storniert und bleibt es nach dem Abgleich", async () => {
    const id = await neueRechnung();
    await sevdeskUebertragen(bueroC, sev.client, await detail(id), true);
    const d = await detail(id);
    expect((await sevdeskStornieren(bueroC, sev.client, d)).fehler).toBeUndefined();
    expect(sev.rechnungen.get(d.rechnung.sevdeskId!)!.storniert).toBe(true);
    const { data } = await adminClient().from("invoices").select("lexware_status, storniert_am").eq("id", id).single();
    expect(data!.lexware_status).toBe("voided");
    expect(data!.storniert_am).not.toBeNull();
    await sevdeskAbgleichen(bueroC, sev.client, await detail(id));
    expect((await adminClient().from("invoices").select("lexware_status").eq("id", id).single()).data!.lexware_status).toBe("voided");
    expect((await sevdeskStornieren(bueroC, sev.client, await detail(id))).fehler).toContain("schon storniert");
  });

  it("schlägt sevdesk fehl, geht die Rechnung zurück auf Entwurf und kann nochmal gesendet werden", async () => {
    const id = await neueRechnung();
    const kaputt = erzeugeSevdeskClient({
      token: "t".repeat(32),
      basis: "https://schein.test/api/v1",
      abstandMs: 0,
      warte: async () => {},
      fetchFn: (async (url: string | URL | Request) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad.endsWith("/SevUser")) return new Response(JSON.stringify({ objects: [{ id: "77" }] }), { status: 200 });
        if (pfad.endsWith("/saveInvoice")) return new Response(JSON.stringify({ error: { message: "taxRate nicht erlaubt" } }), { status: 422 });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    const r = await sevdeskUebertragen(bueroC, kaputt, await detail(id), true);
    expect(r.fehler).toContain("taxRate nicht erlaubt");
    const { data } = await adminClient().from("invoices").select("status, anbieter, sevdesk_id").eq("id", id).single();
    expect(data).toMatchObject({ status: "entwurf", anbieter: "lexware", sevdesk_id: null });
    expect((await sevdeskUebertragen(bueroC, sev.client, await detail(id), true)).fehler).toBeUndefined();
  });

  it("Mitarbeiter sehen weder Mahnungen noch Rechnungen", async () => {
    const maler = await testNutzerAnlegen("mitarbeiter");
    try {
      const c = await einloggen(maler.benutzername, maler.passwort);
      expect((await c.from("invoice_reminders").select("id")).data ?? []).toEqual([]);
      expect((await c.from("invoices").select("id")).data ?? []).toEqual([]);
      expect((await c.from("invoice_reminders").insert({ invoice_id: rechnungId, stufe: 1 })).error).not.toBeNull();
    } finally {
      await testNutzerLoeschen(maler);
    }
  });
});
