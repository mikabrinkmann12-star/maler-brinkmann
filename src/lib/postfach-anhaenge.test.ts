import MailComposer from "nodemailer/lib/mail-composer";
import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { BILD_MINDESTGROESSE, anhaengeAuswaehlen, type MailAnhang } from "./postfach-anhaenge";

const anhang = (teil: Partial<MailAnhang>): MailAnhang => ({ filename: "r.pdf", contentType: "application/pdf", content: new Uint8Array(100), ...teil });

describe("anhaengeAuswaehlen", () => {
  it("nimmt PDF und XML, auch nach Typ, wenn der Name keine Endung hat", () => {
    const r = anhaengeAuswaehlen([anhang({}), anhang({ filename: "rechnung.XML", contentType: "text/xml" }), anhang({ filename: "Rechnung 4711", contentType: "application/pdf" })]);
    expect(r.map((a) => [a.dateiname, a.endung])).toEqual([["r.pdf", "pdf"], ["rechnung.XML", "xml"], ["Rechnung 4711", "pdf"]]);
  });

  it("ignoriert andere Dateien, leere und zu große", () => {
    expect(anhaengeAuswaehlen([anhang({ filename: "a.docx", contentType: "application/msword" }), anhang({ content: new Uint8Array(0) })])).toEqual([]);
  });

  it("ignoriert kleine und eingebettete Bilder (Logos, Signaturen), nimmt große Fotos", () => {
    const klein = anhang({ filename: "logo.png", contentType: "image/png", content: new Uint8Array(BILD_MINDESTGROESSE - 1) });
    const inline = anhang({ filename: "foto.jpg", contentType: "image/jpeg", content: new Uint8Array(BILD_MINDESTGROESSE + 1), contentDisposition: "inline" });
    const gross = anhang({ filename: "scan.jpeg", contentType: "image/jpeg", content: new Uint8Array(BILD_MINDESTGROESSE + 1), contentDisposition: "attachment" });
    const r = anhaengeAuswaehlen([klein, inline, gross]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ dateiname: "scan.jpeg", endung: "jpg", typ: "image/jpeg" });
  });
});

describe("echte E-Mail mit Anhang", () => {
  it("findet das PDF in einer fertig gebauten Mail", async () => {
    const roh = await new MailComposer({
      from: "Lieferant <rechnung@farben-mueller.example>",
      to: "rechnungen@maler.example",
      subject: "Ihre Rechnung",
      text: "Anbei die Rechnung.",
      attachments: [{ filename: "RE-2026-0815.pdf", content: Buffer.from("%PDF-1.4 test"), contentType: "application/pdf" }],
    }).compile().build();
    const mail = await simpleParser(roh);
    expect(mail.from?.text).toContain("rechnung@farben-mueller.example");
    const r = anhaengeAuswaehlen(
      mail.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.size, content: a.content, contentDisposition: a.contentDisposition, related: a.related })),
    );
    expect(r.map((a) => a.dateiname)).toEqual(["RE-2026-0815.pdf"]);
    expect(r[0].bytes.length).toBe(13);
  });
});
