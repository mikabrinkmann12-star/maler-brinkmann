// Schein-Server für sevdesk, nur zum Ausprobieren der App ohne echtes Konto: `npx tsx scripts/sevdesk-schein-server.ts`
// Dann in .env.local setzen: SEVDESK_API_TOKEN=schein  und  SEVDESK_BASIS_URL=http://localhost:4010/api/v1  (nur in der Entwicklung wirksam).
// Merkt sich Rechnungen im Speicher und versteht die Anfragen, die die App schickt. Es ist KEIN Ersatz für einen Test mit dem echten Konto.
import { createServer } from "node:http";

type R = { id: string; status: string; nummer: string; pos: { quantity: number; price: number; taxRate: number }[]; festgeschrieben: boolean };
const rechnungen = new Map<string, R>();
let zaehler = 1000;
let kontakte = 900;

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const u = new URL(req.url ?? "/", "http://x");
    const pfad = u.pathname.replace("/api/v1", "");
    const m = req.method ?? "GET";
    let body: Record<string, any> = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      /* leer */
    }
    const senden = (daten: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(daten));
    };
    console.log(m, pfad);
    if (m === "GET" && pfad === "/Tools/bookkeepingSystemVersion") return senden({ objects: { version: "2.0" } });
    if (m === "GET" && pfad === "/SevUser") return senden({ objects: [{ id: "77", firstName: "Ralf", lastName: "Brinkmann" }] });
    if (m === "GET" && pfad === "/Unity") return senden({ objects: [{ id: "1", name: "Stk" }, { id: "4", name: "m²" }, { id: "9", name: "Std." }, { id: "7", name: "psch" }] });
    if (m === "GET" && pfad === "/CheckAccount") return senden({ objects: [{ id: "11", status: "100" }] });
    if (m === "POST" && pfad === "/Contact") return senden({ objects: { id: String(++kontakte) } }, 201);
    if (m === "POST" && (pfad === "/ContactAddress" || pfad === "/CommunicationWay")) return senden({ objects: { id: "1" } }, 201);
    if (m === "POST" && pfad === "/Invoice/Factory/saveInvoice") {
      const id = String(++zaehler);
      rechnungen.set(id, { id, status: "100", nummer: "", festgeschrieben: false, pos: (body.invoicePosSave ?? []).map((p: any) => ({ quantity: p.quantity, price: p.price, taxRate: p.taxRate })) });
      return senden({ objects: { invoice: { id }, invoicePos: [] } }, 201);
    }
    if (m === "POST" && pfad === "/Invoice/Factory/createInvoiceReminder") {
      const id = String(++zaehler);
      rechnungen.set(id, { id, status: "100", nummer: "MA-1", festgeschrieben: false, pos: [] });
      return senden({ objects: { id } });
    }
    const t = /^\/Invoice\/(\d+)(\/\w+)?$/.exec(pfad);
    const r = t ? rechnungen.get(t[1]) : undefined;
    if (t && !r) return senden({ error: { message: "nicht gefunden" } }, 404);
    if (t && r) {
      const aktion = t[2];
      if (m === "GET" && !aktion) {
        const netto = r.pos.reduce((s, p) => s + p.quantity * p.price, 0);
        const brutto = r.pos.reduce((s, p) => s + p.quantity * p.price * (1 + p.taxRate / 100), 0);
        return senden({ objects: [{ id: r.id, invoiceNumber: r.nummer, status: r.status, sumNet: netto.toFixed(2), sumGross: brutto.toFixed(2), enshrined: r.festgeschrieben ? "2026-10-20 10:00:00" : null }] });
      }
      if (m === "PUT" && aktion === "/sendBy") {
        r.status = "200";
        r.nummer ||= `RE-${r.id}`;
        return senden({ objects: {} });
      }
      if (m === "PUT" && aktion === "/enshrine") {
        r.festgeschrieben = true;
        return senden({ objects: null });
      }
      if (m === "GET" && aktion === "/getPdf") {
        const pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
        return senden({ objects: { filename: `${r.nummer}.pdf`, mimeType: "application/pdf", base64encoded: true, content: Buffer.from(pdf).toString("base64") } });
      }
      if (m === "POST" && aktion === "/sendViaEmail") {
        if (r.status === "100") {
          r.status = "200";
          r.nummer ||= `RE-${r.id}`;
        }
        return senden({ objects: {} }, 201);
      }
      if (m === "PUT" && aktion === "/bookAmount") {
        r.status = "1000";
        return senden({ objects: {} });
      }
      if (m === "POST" && aktion === "/cancelInvoice") return senden({ objects: { id: String(++zaehler) } });
    }
    return senden({ error: { message: `unbekannt: ${m} ${pfad}` } }, 404);
  });
});

server.listen(4010, () => console.log("sevdesk-Schein-Server läuft auf http://localhost:4010/api/v1"));
