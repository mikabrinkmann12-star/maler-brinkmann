import { describe, expect, it, vi } from "vitest";
import { LexwareFehler, erzeugeLexwareClient, lexwareFehlerText } from "./lexware-client";
import type { LexwareRechnungPayload } from "./rechnung";

const json = (status: number, koerper: unknown) => new Response(JSON.stringify(koerper), { status, headers: { "Content-Type": "application/json" } });
const ohneWarten = async () => undefined;

function client(antworten: Response[]) {
  const fetchFn = vi.fn(async () => antworten.shift() ?? json(500, {}));
  return { fetchFn, c: erzeugeLexwareClient({ apiKey: "geheim", fetchFn: fetchFn as unknown as typeof fetch, warte: ohneWarten }) };
}

const payload = { title: "x" } as unknown as LexwareRechnungPayload;

describe("Lexware-Client", () => {
  it("sendet den Schlüssel als Bearer-Token und liest das Profil", async () => {
    const { c, fetchFn } = client([json(200, { organizationId: "o-1", businessFeatures: ["INVOICING", "BOOKKEEPING"], smallBusiness: false, created: { userEmail: "info@example.de" } })]);
    expect(await c.profil()).toEqual({ organisationsId: "o-1", email: "info@example.de", funktionen: ["INVOICING", "BOOKKEEPING"], kleinunternehmer: false });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.lexware.io/v1/profile");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer geheim");
  });

  it("Rechnung: ohne finalize = Entwurf, mit ?finalize=true = finalisiert", async () => {
    const { c, fetchFn } = client([json(201, { id: "r-1" }), json(201, { id: "r-2" })]);
    expect(await c.rechnungAnlegen(payload, false)).toBe("r-1");
    expect(await c.rechnungAnlegen(payload, true)).toBe("r-2");
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe("https://api.lexware.io/v1/invoices");
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).toBe("https://api.lexware.io/v1/invoices?finalize=true");
    const init = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(init[1].method).toBe("POST");
    expect(JSON.parse(init[1].body as string)).toEqual({ title: "x" });
  });

  it("Kunde anlegen gibt die ID zurück; ohne ID ein Fehler", async () => {
    const { c } = client([json(201, { id: "k-1", version: 1 }), json(201, {})]);
    expect(await c.kontaktAnlegen({ version: 0 })).toBe("k-1");
    await expect(c.kontaktAnlegen({ version: 0 })).rejects.toBeInstanceOf(LexwareFehler);
  });

  it("liest Nummer, Status und Summen einer Rechnung", async () => {
    const { c } = client([json(200, { voucherNumber: "RE1019", voucherStatus: "open", totalPrice: { totalNetAmount: 10, totalGrossAmount: 11.9 } })]);
    expect(await c.rechnungLesen("r-1")).toEqual({ rechnungsnummer: "RE1019", status: "open", netto: 10, brutto: 11.9 });
  });

  it("wiederholt bei 429 mit Pause und gibt danach nach", async () => {
    const { c, fetchFn } = client([json(429, {}), json(429, {}), json(200, { organizationId: "X" })]);
    expect((await c.profil()).organisationsId).toBe("X");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("gibt nach zu vielen 429 auf", async () => {
    const { c } = client([json(429, {}), json(429, {}), json(429, {}), json(429, {})]);
    await expect(c.profil()).rejects.toMatchObject({ status: 429 });
  });

  it("macht aus Fehlerantworten deutsche Meldungen mit den Einzelheiten von Lexware", async () => {
    const { c } = client([json(401, {}), json(400, { details: [{ field: "lineItems[0].quantity", message: "must not be null" }] })]);
    await expect(c.profil()).rejects.toThrow("Schlüssel");
    await expect(c.rechnungAnlegen(payload, false)).rejects.toThrow("lineItems[0].quantity: must not be null");
  });

  it("PDF: wiederholt bei 404/409 direkt nach dem Finalisieren, liefert dann die Bytes", async () => {
    const pdf = new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200, headers: { "Content-Type": "application/pdf" } });
    const { c, fetchFn } = client([json(404, {}), json(409, {}), pdf]);
    const bytes = await c.rechnungPdf("r-1");
    expect(Array.from(bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(((fetchFn.mock.calls[2] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Accept).toBe("application/pdf");
  });

  it("PDF: ein anderer Fehler (z. B. 401) wird nicht wiederholt", async () => {
    const { c, fetchFn } = client([json(401, {}), json(200, {})]);
    await expect(c.rechnungPdf("r-1")).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("Netzfehler werden zu einer verständlichen Meldung", async () => {
    const c = erzeugeLexwareClient({ apiKey: "k", fetchFn: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, warte: ohneWarten });
    await expect(c.profil()).rejects.toThrow("nicht erreichbar");
  });

  it("lässt zwischen zwei Anfragen eine Pause (Lexware erlaubt 2 pro Sekunde)", async () => {
    const warten: number[] = [];
    const fetchFn = vi.fn(async () => json(200, { organizationId: "X" }));
    const c = erzeugeLexwareClient({ apiKey: "k", fetchFn: fetchFn as unknown as typeof fetch, abstandMs: 500, warte: async (ms) => { warten.push(ms); } });
    await c.profil();
    await c.profil();
    expect(warten.length).toBeGreaterThanOrEqual(1);
    expect(warten[0]).toBeGreaterThan(0);
    expect(warten[0]).toBeLessThanOrEqual(500);
  });
});

describe("Original-Datei der Rechnung", () => {
  it("fragt mit beliebigem Accept und liefert Bytes samt Dateityp (XML bei XRechnung, PDF sonst)", async () => {
    const xml = new Response("<Invoice/>", { status: 200, headers: { "Content-Type": "application/xml" } });
    const { c, fetchFn } = client([xml]);
    const d = await c.rechnungDatei("r-1");
    expect(d.contentType).toBe("application/xml");
    expect(new TextDecoder().decode(d.bytes)).toBe("<Invoice/>");
    expect(((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Accept).toBe("*/*");

    const pdf = new Response(new Uint8Array([0x25, 0x50]), { status: 200, headers: { "Content-Type": "application/pdf" } });
    expect((await client([json(404, {}), pdf]).c.rechnungDatei("r-2")).contentType).toBe("application/pdf");
  });
});

describe("lexwareFehlerText", () => {
  it("Statuscodes", () => {
    expect(lexwareFehlerText(404, null)).toContain("kennt");
    expect(lexwareFehlerText(500, null)).toContain("nicht erreichbar");
    expect(lexwareFehlerText(406, { message: "x" })).toContain("(x)");
  });
});
