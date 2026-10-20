import { describe, expect, it } from "vitest";
import { erzeugeSevdeskClient, sevdeskFehlerText, SevdeskFehler } from "./sevdesk-client";

type Aufruf = { methode: string; pfad: string; body: unknown; kopf: Record<string, string> };

/** Schein-Server: antwortet mit festen Antworten je „METHODE /pfad“ (ohne Abfrageteil), merkt sich alle Aufrufe. */
export function scheinServer(antworten: Record<string, unknown | ((body: unknown) => unknown)>) {
  const aufrufe: Aufruf[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const methode = init?.method ?? "GET";
    const pfad = u.pathname.replace("/api/v1", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    aufrufe.push({ methode, pfad, body, kopf: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) });
    const treffer = antworten[`${methode} ${pfad}`];
    if (treffer === undefined) return new Response(JSON.stringify({ error: { message: "unbekannt" } }), { status: 404 });
    const antwort = typeof treffer === "function" ? (treffer as (b: unknown) => unknown)(body) : treffer;
    if (antwort instanceof Response) return antwort;
    return new Response(JSON.stringify(antwort), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { aufrufe, fetchFn };
}

const client = (antworten: Parameters<typeof scheinServer>[0]) => {
  const s = scheinServer(antworten);
  return { ...s, c: erzeugeSevdeskClient({ token: "t".repeat(32), basis: "https://schein.test/api/v1", fetchFn: s.fetchFn, abstandMs: 0, warte: async () => {} }) };
};

describe("sevdeskFehlerText", () => {
  it("übersetzt häufige Fehler", () => {
    expect(sevdeskFehlerText(401, null)).toContain("Token");
    expect(sevdeskFehlerText(422, { error: { message: "taxRate falsch" } })).toContain("taxRate falsch");
    expect(sevdeskFehlerText(429, null)).toContain("ausgelastet");
    expect(sevdeskFehlerText(503, null)).toContain("nicht erreichbar");
  });
});

describe("Sevdesk-Client", () => {
  it("schickt den Token ohne Bearer im Kopf Authorization", async () => {
    const { c, aufrufe } = client({ "GET /Tools/bookkeepingSystemVersion": { objects: { version: "2.0" } }, "GET /SevUser": { objects: [{ id: "77", firstName: "Ralf", lastName: "Brinkmann" }] }, "GET /CheckAccount": { objects: [{ id: "5" }] } });
    const r = await c.verbindungPruefen();
    expect(r).toEqual({ version: "2.0", benutzerName: "Ralf Brinkmann", benutzerId: "77", kassen: 1 });
    expect(aufrufe[0].kopf.Authorization).toBe("t".repeat(32));
    expect(aufrufe[0].kopf.Authorization).not.toContain("Bearer");
  });

  it("legt einen Firmenkunden mit Adresse und E-Mail an", async () => {
    const { c, aufrufe } = client({
      "POST /Contact": { objects: { id: "900" } },
      "POST /ContactAddress": { objects: { id: "1" } },
      "POST /CommunicationWay": { objects: { id: "2" } },
    });
    const id = await c.kontaktAnlegen({ firma: "Muster GmbH", vorname: "", nachname: "", ansprechpartner: "Erika Muster", strasse: "Hauptstr. 1", plz: "26683", ort: "Saterland", email: "e@muster.de", kundennummer: "KD-1", leitwegId: "" });
    expect(id).toBe("900");
    expect(aufrufe.map((a) => `${a.methode} ${a.pfad}`)).toEqual(["POST /Contact", "POST /ContactAddress", "POST /CommunicationWay"]);
    expect(aufrufe[0].body).toMatchObject({ name: "Muster GmbH", category: { id: 3, objectName: "Category" }, customerNumber: "KD-1" });
    expect(aufrufe[1].body).toMatchObject({ contact: { id: 900, objectName: "Contact" }, street: "Hauptstr. 1", zip: "26683", city: "Saterland" });
    expect(aufrufe[2].body).toMatchObject({ type: "EMAIL", value: "e@muster.de" });
  });

  it("legt einen Privatkunden mit Vor- und Nachnamen an", async () => {
    const { c, aufrufe } = client({ "POST /Contact": { objects: { id: "901" } } });
    await c.kontaktAnlegen({ firma: "", vorname: "Anna", nachname: "Apfel", ansprechpartner: "", strasse: "", plz: "", ort: "", email: "", kundennummer: "", leitwegId: "" });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].body).toMatchObject({ surename: "Anna", familyname: "Apfel" });
    expect(aufrufe[0].body).not.toHaveProperty("name");
  });

  it("liest die ID einer neuen Rechnung aus der Antwort", async () => {
    const { c } = client({ "POST /Invoice/Factory/saveInvoice": { objects: { invoice: { id: "4711" }, invoicePos: [] } } });
    expect(await c.rechnungAnlegen({ invoice: {}, invoicePosSave: [], invoicePosDelete: null, discountSave: null, discountDelete: null, takeDefaultAddress: true })).toBe("4711");
  });

  it("markiert als versendet, schreibt fest und liest Nummer, Status und Summen (Beträge als Text)", async () => {
    const { c, aufrufe } = client({
      "PUT /Invoice/4711/sendBy": { objects: {} },
      "PUT /Invoice/4711/enshrine": { objects: null },
      "GET /Invoice/4711": { objects: [{ id: "4711", invoiceNumber: "RE-1001", status: "200", sumNet: "100.0", sumGross: "119.0", enshrined: "2026-10-20 10:00:00" }] },
    });
    await c.alsVersendetMarkieren("4711");
    await c.festschreiben("4711");
    expect(aufrufe[0].body).toEqual({ sendType: "VPDF", sendDraft: false });
    expect(await c.rechnungLesen("4711")).toMatchObject({ rechnungsnummer: "RE-1001", status: "open", netto: 100, brutto: 119, festgeschrieben: true, teilbezahlt: false });
  });

  it("holt das PDF aus der Base64-Antwort und die XML-Datei", async () => {
    const { c } = client({
      "GET /Invoice/4711/getPdf": { objects: { filename: "RE-1001.pdf", mimeType: "application/pdf", base64encoded: true, content: Buffer.from("%PDF-1.4 test").toString("base64") } },
      "GET /Invoice/4711/getXml": { objects: "<?xml version=\"1.0\"?><Invoice/>" },
    });
    expect(Buffer.from(await c.rechnungPdf("4711")).toString()).toBe("%PDF-1.4 test");
    expect(Buffer.from(await c.rechnungXml("4711")).toString()).toContain("<Invoice/>");
  });

  it("sendet die Mail mit den Feldern, die sevdesk verlangt", async () => {
    const { c, aufrufe } = client({ "POST /Invoice/4711/sendViaEmail": { objects: {} } });
    await c.perMailSenden("4711", { an: "k@x.de", betreff: "Rechnung", text: "Hallo", xmlStattPdf: true });
    expect(aufrufe[0].body).toEqual({ toEmail: "k@x.de", subject: "Rechnung", text: "Hallo", copy: false, sendXml: true });
  });

  it("bucht eine Zahlung mit Konto, Betrag und Datum als Unix-Zeit", async () => {
    const { c, aufrufe } = client({
      "GET /CheckAccount": { objects: [{ id: "10", status: "0" }, { id: "11", status: "100" }] },
      "PUT /Invoice/4711/bookAmount": { objects: {} },
    });
    const konto = await c.zahlungskonto();
    expect(konto).toBe("11");
    await c.zahlungBuchen("4711", { betrag: 119, datum: "2026-10-20", kontoId: konto });
    expect(aufrufe[1].body).toMatchObject({ amount: 119, type: "FULL_PAYMENT", checkAccount: { id: 11, objectName: "CheckAccount" } });
    expect((aufrufe[1].body as { date: number }).date).toBe(Math.floor(Date.parse("2026-10-20T12:00:00Z") / 1000));
  });

  it("legt eine Mahnung und eine Stornorechnung an", async () => {
    const { c } = client({
      "POST /Invoice/Factory/createInvoiceReminder": { objects: { id: "5000" } },
      "POST /Invoice/4711/cancelInvoice": { objects: { id: "5001" } },
    });
    expect(await c.mahnungAnlegen("4711")).toBe("5000");
    expect(await c.stornieren("4711")).toBe("5001");
  });

  it("ordnet Einheiten zu und fällt ohne Einheitenliste nicht um", async () => {
    const mit = client({ "GET /Unity": { objects: [{ id: "1", name: "Stk" }, { id: "9", name: "Std." }] } });
    const karte = await mit.c.einheiten();
    expect(karte.get("stk")).toBe(1);
    expect(karte.get("std")).toBe(9);
    const ohne = client({});
    expect((await ohne.c.einheiten()).size).toBe(0);
  });

  it("übersetzt Fehlerantworten und wiederholt bei 429", async () => {
    let versuche = 0;
    const s = client({
      "GET /SevUser": () => {
        versuche++;
        return versuche === 1 ? new Response("{}", { status: 429 }) : { objects: [{ id: "1" }] };
      },
      "POST /Contact": new Response(JSON.stringify({ error: { message: "Name fehlt" } }), { status: 422 }),
    });
    expect((await s.c.ersterBenutzer()).id).toBe("1");
    expect(versuche).toBe(2);
    await expect(s.c.kontaktAnlegen({ firma: "x", vorname: "", nachname: "", ansprechpartner: "", strasse: "", plz: "", ort: "", email: "", kundennummer: "", leitwegId: "" })).rejects.toThrow(/Name fehlt/);
    const f = await s.c.rechnungLesen("1").catch((e) => e);
    expect(f).toBeInstanceOf(SevdeskFehler);
    expect((f as SevdeskFehler).status).toBe(404);
  });
});
