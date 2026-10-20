import { describe, expect, it } from "vitest";
import { angebotLink, angebotMailHtml, angebotMailText, appBasisUrl, htmlMaskieren, istLinkSchluessel, linkSchluesselErzeugen } from "./angebot-freigabe";

describe("Schlüssel", () => {
  it("erzeugt 48 Hex-Zeichen und einen Hash", () => {
    const s = linkSchluesselErzeugen();
    expect(istLinkSchluessel(s.klartext)).toBe(true);
    expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.hash).not.toBe(s.klartext);
    expect(linkSchluesselErzeugen().klartext).not.toBe(s.klartext);
  });
  it("lehnt Fremdes ab", () => {
    expect(istLinkSchluessel("")).toBe(false);
    expect(istLinkSchluessel("abc")).toBe(false);
    expect(istLinkSchluessel(`${"a".repeat(47)}g`)).toBe(false);
  });
});

describe("Adresse", () => {
  it("nimmt NEXT_PUBLIC_APP_URL, sonst die Vercel-Produktionsadresse, sonst lokal", () => {
    expect(appBasisUrl({ NEXT_PUBLIC_APP_URL: "https://app.example.de/" })).toBe("https://app.example.de");
    expect(appBasisUrl({ VERCEL_PROJECT_PRODUCTION_URL: "maler.vercel.app" })).toBe("https://maler.vercel.app");
    expect(appBasisUrl({})).toBe("http://localhost:3000");
  });
  it("baut den Link", () => {
    expect(angebotLink("https://x.de/", "abc")).toBe("https://x.de/angebot/abc");
  });
});

describe("E-Mail", () => {
  it("maskiert HTML in Text, Firmenname und Fußzeile (kein Einschleusen)", () => {
    expect(htmlMaskieren(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    const html = angebotMailHtml({ text: "Hallo <script>alert(1)</script>\n\nGruß", link: "https://x.de/angebot/abc", firmenname: "Müller & Söhne <GmbH>", fusszeile: ["Weg 1", "<b>fett</b>"] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Müller &amp; Söhne &lt;GmbH&gt;");
    expect(html).toContain("&lt;b&gt;fett&lt;/b&gt;");
  });
  it("enthält den grünen Knopf mit dem Link und ein Logo, wenn vorhanden", () => {
    const html = angebotMailHtml({ text: "Text", link: "https://x.de/angebot/abc", firmenname: "Firma", fusszeile: [], logoCid: "logo@firma" });
    expect(html).toContain('href="https://x.de/angebot/abc"');
    expect(html).toContain("Ihr Angebot ansehen");
    expect(html).toContain("cid:logo@firma");
    expect(angebotMailHtml({ text: "T", link: "l", firmenname: "Firma", fusszeile: [] })).not.toContain("cid:");
  });
  it("Absätze und Zeilenumbrüche bleiben erhalten", () => {
    const html = angebotMailHtml({ text: "Eins\nZwei\n\nDrei", link: "l", firmenname: "F", fusszeile: [] });
    expect(html).toContain("Eins<br>Zwei");
    expect((html.match(/<p style="margin:0 0 16px/g) ?? []).length).toBe(2);
  });
  it("Textfassung nennt den Link", () => {
    expect(angebotMailText("Hallo", "https://x.de/angebot/abc")).toBe("Hallo\n\nIhr Angebot ansehen: https://x.de/angebot/abc\n");
  });
});
