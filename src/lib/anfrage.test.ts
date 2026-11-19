import { describe, expect, it } from "vitest";
import { anfrageNormalisieren, anfrageNotiz, dublettenFinden, kontaktVorschlag, nameAufteilen, type KontaktFuerDublette } from "./anfrage";

const ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const gueltig = { id: ID, name: "Max Mustermann", telefon: "040 66969 123", email: "max@example.com", betreff: "Fassade", nachricht: "Bitte um ein Angebot.", quelle: "website", datenschutz: true };

describe("Anfrage prüfen (Webhook)", () => {
  it("nimmt eine vollständige Anfrage an, schneidet Leerzeichen ab und ignoriert fremde Felder", () => {
    const r = anfrageNormalisieren({ ...gueltig, name: "  Max Mustermann ", strasse: " Birkenweg 7 ", plz: "26683", ort: "Saterland", extra: "egal" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anfrage).toMatchObject({ id: ID, name: "Max Mustermann", strasse: "Birkenweg 7", plz: "26683", ort: "Saterland", quelle: "website" });
    expect(r.anfrage).not.toHaveProperty("extra");
  });

  it("Telefon ODER E-Mail reicht, beides fehlt: Fehler", () => {
    expect(anfrageNormalisieren({ ...gueltig, email: "" }).ok).toBe(true);
    expect(anfrageNormalisieren({ ...gueltig, telefon: null }).ok).toBe(true);
    const r = anfrageNormalisieren({ ...gueltig, telefon: "", email: "  " });
    expect(r).toEqual({ ok: false, fehler: "Telefon oder E-Mail fehlt." });
  });

  it("Pflichtfelder: Name, Nachricht und eine gültige ID", () => {
    expect(anfrageNormalisieren({ ...gueltig, name: "   " }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, nachricht: "" }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, id: "keine-uuid" }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, id: undefined }).ok).toBe(false);
  });

  it("lehnt ungültige E-Mail, zu lange Felder und Nicht-Objekte ab", () => {
    expect(anfrageNormalisieren({ ...gueltig, email: "kein-at" }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, nachricht: "x".repeat(10001) }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, telefon: "1".repeat(41) }).ok).toBe(false);
    expect(anfrageNormalisieren({ ...gueltig, plz: "12345678901" }).ok).toBe(false);
    expect(anfrageNormalisieren([gueltig]).ok).toBe(false);
    expect(anfrageNormalisieren("text").ok).toBe(false);
    expect(anfrageNormalisieren(null).ok).toBe(false);
  });

  it("falsche Typen werden abgelehnt, Steuerzeichen entfernt", () => {
    expect(anfrageNormalisieren({ ...gueltig, name: 42 }).ok).toBe(false);
    const r = anfrageNormalisieren({ ...gueltig, nachricht: "Hallo\u0000 Welt\nZeile 2" });
    expect(r.ok && r.anfrage.nachricht).toBe("Hallo Welt\nZeile 2");
  });

  it("Quelle: Standard „website“, nur einfache Kennungen", () => {
    const r = anfrageNormalisieren({ ...gueltig, quelle: undefined });
    expect(r.ok && r.anfrage.quelle).toBe("website");
    expect(anfrageNormalisieren({ ...gueltig, quelle: "<script>" }).ok).toBe(false);
  });
});

describe("Name aufteilen", () => {
  it.each([
    ["Max Mustermann", { anrede: "", vorname: "Max", nachname: "Mustermann" }],
    ["  Anna   Maria  Schulte ", { anrede: "", vorname: "Anna Maria", nachname: "Schulte" }],
    ["Mustermann, Max", { anrede: "", vorname: "Max", nachname: "Mustermann" }],
    ["Schröder", { anrede: "", vorname: "", nachname: "Schröder" }],
    ["Familie Schröder", { anrede: "Familie", vorname: "", nachname: "Schröder" }],
    ["Herr Max Mustermann", { anrede: "Herr", vorname: "Max", nachname: "Mustermann" }],
    ["Frau Dr. Meyer", { anrede: "Frau", vorname: "Dr.", nachname: "Meyer" }],
    ["Anna de Vries", { anrede: "", vorname: "Anna", nachname: "de Vries" }],
    ["Ludwig van der Berg", { anrede: "", vorname: "Ludwig", nachname: "van der Berg" }],
    ["Herr", { anrede: "", vorname: "", nachname: "Herr" }],
    ["", { anrede: "", vorname: "", nachname: "" }],
  ])("%s", (roh, erwartet) => {
    expect(nameAufteilen(roh)).toEqual(erwartet);
  });
});

describe("Kontakt-Vorschlag", () => {
  const anfrage = { name: "Herr Max Mustermann", telefon: "040 66969 123", email: "max@example.com", betreff: "Fassade", nachricht: "Bitte um ein Angebot.", strasse: "Birkenweg 7", plz: "26683", ort: "Saterland", created_at: "2026-11-19T09:30:00Z" };

  it("füllt alle Felder vor, Notiz mit Datum, Betreff und Nachricht", () => {
    expect(kontaktVorschlag(anfrage)).toEqual({
      anrede: "Herr",
      vorname: "Max",
      nachname: "Mustermann",
      strasse: "Birkenweg 7",
      plz: "26683",
      ort: "Saterland",
      telefon: "040 66969 123",
      email: "max@example.com",
      notizen: "Website-Anfrage vom 19.11.2026: Fassade\nBitte um ein Angebot.",
    });
  });

  it("vom Absender aufgeteilte Namen gehen vor; fehlende Angaben werden leer", () => {
    const v = kontaktVorschlag({ ...anfrage, vorname: "Maximilian", nachname: "Muster", telefon: null, strasse: null, plz: null, ort: null });
    expect(v).toMatchObject({ vorname: "Maximilian", nachname: "Muster", telefon: "", strasse: "", plz: "", ort: "" });
  });

  it("ohne Betreff und sehr lange Nachricht: Notiz höchstens 2.000 Zeichen", () => {
    expect(anfrageNotiz({ betreff: "", nachricht: "Hallo", created_at: "2026-11-19T09:30:00Z" })).toBe("Website-Anfrage vom 19.11.2026\nHallo");
    expect(anfrageNotiz({ betreff: "", nachricht: "x".repeat(5000), created_at: "2026-11-19T09:30:00Z" })).toHaveLength(2000);
  });
});

describe("Dubletten", () => {
  const k = (id: string, felder: Partial<KontaktFuerDublette>): KontaktFuerDublette => ({
    id, firmenname: null, vorname: null, nachname: null, strasse: null, plz: null, telefon: null, mobil: null, email: null, ...felder,
  });
  const vorschlag = { vorname: "Max", nachname: "Mustermann", strasse: "Birkenweg 7", plz: "26683", telefon: "04492 66969", email: "Max@Example.com" };

  it("findet über E-Mail (ohne Groß/Klein), Telefon/Mobil (andere Schreibweise) und Name + Adresse", () => {
    const kontakte = [
      k("mail", { nachname: "Anders", email: "max@example.com " }),
      k("tel", { nachname: "Anders", mobil: "+49 4492 66969" }),
      k("name", { vorname: "Max", nachname: "Mustermann", strasse: "Birkenweg 7", plz: "26683" }),
      k("fremd", { vorname: "Max", nachname: "Mustermann", strasse: "Andere Str. 1", plz: "26683", telefon: "0441 123456" }),
    ];
    const t = dublettenFinden(vorschlag, kontakte);
    expect(t.map((d) => d.id).sort()).toEqual(["mail", "name", "tel"]);
    expect(t.find((d) => d.id === "mail")?.gruende).toEqual(["email"]);
    expect(t.find((d) => d.id === "tel")?.gruende).toEqual(["telefon"]);
    expect(t.find((d) => d.id === "name")?.gruende).toEqual(["name"]);
  });

  it("mehrere Gründe zuerst; höchstens max Treffer", () => {
    const kontakte = [
      k("eins", { email: "max@example.com" }),
      k("drei", { vorname: "Max", nachname: "Mustermann", strasse: "Birkenweg 7", plz: "26683", telefon: "04492/66969", email: "max@example.com" }),
    ];
    const t = dublettenFinden(vorschlag, kontakte, 1);
    expect(t).toEqual([{ id: "drei", gruende: ["email", "telefon", "name"] }]);
  });

  it("leere Angaben treffen nichts", () => {
    const leer = { vorname: "", nachname: "", strasse: "", plz: "", telefon: "", email: "" };
    expect(dublettenFinden(leer, [k("x", {}), k("y", { email: "" })])).toEqual([]);
  });
});
