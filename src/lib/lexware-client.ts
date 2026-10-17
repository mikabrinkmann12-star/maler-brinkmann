// Kleiner Client für die Lexware Office Public API (https://developers.lexware.io). Kein Zugriff auf Umgebungsvariablen:
// Der Schlüssel wird übergeben (siehe lexware.ts, nur serverseitig). Dadurch lässt sich der Client ohne echten Zugang testen.
//
// Regeln der Schnittstelle: Bearer-Schlüssel, höchstens 2 Anfragen pro Sekunde (sonst HTTP 429), Rechnungen als Entwurf
// (ohne `finalize`) oder finalisiert (`?finalize=true`, dann vergibt Lexware die Nummer und erzeugt das PDF).

import { rechnungInfoAusLexware, type LexwareRechnungInfo, type LexwareRechnungPayload } from "@/lib/rechnung";

export const LEXWARE_BASIS = "https://api.lexware.io";

export class LexwareFehler extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LexwareFehler";
    this.status = status;
  }
}

type Optionen = {
  apiKey: string;
  /** Adresse der Schnittstelle (nur für Tests mit einem Schein-Server, sonst api.lexware.io) */
  basis?: string;
  fetchFn?: typeof fetch;
  /** Wartezeit zwischen Anfragen in ms (Lexware erlaubt 2 pro Sekunde) */
  abstandMs?: number;
  /** Wartefunktion, in Tests ersetzbar */
  warte?: (ms: number) => Promise<void>;
};

/** Verständliche deutsche Meldung zu einer Fehlerantwort. */
export function lexwareFehlerText(status: number, koerper: unknown): string {
  const k = typeof koerper === "object" && koerper !== null ? (koerper as Record<string, unknown>) : {};
  const einzelheiten: string[] = [];
  if (Array.isArray(k.details)) {
    for (const d of k.details) {
      if (typeof d === "object" && d !== null) {
        const m = (d as Record<string, unknown>).message;
        const f = (d as Record<string, unknown>).field;
        if (typeof m === "string") einzelheiten.push(typeof f === "string" ? `${f}: ${m}` : m);
      }
    }
  }
  if (Array.isArray(k.IssueList)) {
    for (const d of k.IssueList) {
      if (typeof d === "object" && d !== null) {
        const t = (d as Record<string, unknown>).i18nKey;
        if (typeof t === "string") einzelheiten.push(t);
      }
    }
  }
  const zusatz = einzelheiten.length ? ` (${einzelheiten.slice(0, 4).join("; ")})` : typeof k.message === "string" ? ` (${k.message})` : "";
  if (status === 401) return "Lexware hat den API-Schlüssel abgelehnt. Bitte den Schlüssel prüfen.";
  if (status === 403) return `Der API-Schlüssel hat keine Berechtigung für diese Aktion.${zusatz}`;
  if (status === 404) return "Lexware kennt diesen Eintrag nicht.";
  if (status === 406 || status === 409) return `Lexware kann das gerade nicht liefern (Status ${status}).${zusatz}`;
  if (status === 429) return "Lexware ist gerade ausgelastet (zu viele Anfragen). Bitte gleich nochmal versuchen.";
  if (status >= 500) return "Lexware ist gerade nicht erreichbar. Bitte später nochmal versuchen.";
  return `Lexware hat die Anfrage abgelehnt${zusatz || ` (Status ${status})`}.`;
}

export function erzeugeLexwareClient(opt: Optionen) {
  const fetchFn = opt.fetchFn ?? fetch;
  const basis = opt.basis ?? LEXWARE_BASIS;
  const abstand = opt.abstandMs ?? 550;
  const warte = opt.warte ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let letzte = 0;

  /** Eine Anfrage; bei 429 wird mit Pause wiederholt. Rückgabe ist die rohe Antwort (bereits auf Fehler geprüft). */
  async function anfrage(pfad: string, o: { method?: string; body?: unknown; accept?: string } = {}): Promise<Response> {
    for (let versuch = 0; versuch < 4; versuch++) {
      const seit = Date.now() - letzte;
      if (seit < abstand) await warte(abstand - seit);
      letzte = Date.now();

      let antwort: Response;
      try {
        antwort = await fetchFn(`${basis}${pfad}`, {
          method: o.method ?? "GET",
          headers: {
            Authorization: `Bearer ${opt.apiKey}`,
            Accept: o.accept ?? "application/json",
            ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new LexwareFehler(0, "Lexware ist nicht erreichbar. Bitte die Internetverbindung prüfen und nochmal versuchen.");
      }
      if (antwort.status === 429 && versuch < 3) {
        await warte(1500 * (versuch + 1));
        continue;
      }
      if (!antwort.ok) {
        let koerper: unknown = null;
        try {
          koerper = await antwort.json();
        } catch {
          // keine JSON-Antwort
        }
        throw new LexwareFehler(antwort.status, lexwareFehlerText(antwort.status, koerper));
      }
      return antwort;
    }
    throw new LexwareFehler(429, lexwareFehlerText(429, null));
  }

  return {
    /** Verbindung prüfen: liefert den Firmennamen des Lexware-Kontos. */
    async profil(): Promise<{ firma: string; organisationsId: string }> {
      const j = (await (await anfrage("/v1/profile")).json()) as Record<string, unknown>;
      return {
        firma: typeof j.companyName === "string" ? j.companyName : "",
        organisationsId: typeof j.organizationId === "string" ? j.organizationId : "",
      };
    },

    /** Kunden in Lexware anlegen; gibt die Lexware-ID zurück. */
    async kontaktAnlegen(payload: Record<string, unknown>): Promise<string> {
      const j = (await (await anfrage("/v1/contacts", { method: "POST", body: payload })).json()) as Record<string, unknown>;
      if (typeof j.id !== "string") throw new LexwareFehler(500, "Lexware hat keine Kunden-ID zurückgegeben.");
      return j.id;
    },

    /** Rechnung anlegen. `finalisieren` = true: Lexware vergibt die Nummer und erzeugt das PDF (nicht mehr rücknehmbar). */
    async rechnungAnlegen(payload: LexwareRechnungPayload, finalisieren: boolean): Promise<string> {
      const pfad = `/v1/invoices${finalisieren ? "?finalize=true" : ""}`;
      const j = (await (await anfrage(pfad, { method: "POST", body: payload })).json()) as Record<string, unknown>;
      if (typeof j.id !== "string") throw new LexwareFehler(500, "Lexware hat keine Rechnungs-ID zurückgegeben.");
      return j.id;
    },

    /** Nummer, Status und Summen einer Rechnung. */
    async rechnungLesen(id: string): Promise<LexwareRechnungInfo> {
      return rechnungInfoAusLexware(await (await anfrage(`/v1/invoices/${encodeURIComponent(id)}`)).json());
    },

    /**
     * Original-Datei der Rechnung (Accept: beliebig): bei einer XRechnung die XML-Datei, sonst das PDF (bei ZUGFeRD mit eingebetteten Rechnungsdaten).
     * Das ist die steuerlich gültige Datei. Direkt nach dem Finalisieren ist sie manchmal noch nicht da; dann wird einige Male neu versucht.
     */
    async rechnungDatei(id: string): Promise<{ bytes: Uint8Array; contentType: string }> {
      let letzterFehler: LexwareFehler | null = null;
      for (let versuch = 0; versuch < 5; versuch++) {
        try {
          const antwort = await anfrage(`/v1/invoices/${encodeURIComponent(id)}/file`, { accept: "*/*" });
          return { bytes: new Uint8Array(await antwort.arrayBuffer()), contentType: (antwort.headers.get("content-type") ?? "application/pdf").toLowerCase() };
        } catch (fehler) {
          if (!(fehler instanceof LexwareFehler) || ![404, 406, 409].includes(fehler.status)) throw fehler;
          letzterFehler = fehler;
          await warte(1500);
        }
      }
      throw letzterFehler ?? new LexwareFehler(404, "Die Rechnungsdatei ist bei Lexware noch nicht verfügbar.");
    },

    /** PDF der Rechnung (bei einer XRechnung nur eine Vorschau, keine gültige E-Rechnung). Direkt nach dem Finalisieren ist es manchmal noch nicht da; dann wird einige Male neu versucht. */
    async rechnungPdf(id: string): Promise<Uint8Array> {
      let letzterFehler: LexwareFehler | null = null;
      for (let versuch = 0; versuch < 5; versuch++) {
        try {
          const antwort = await anfrage(`/v1/invoices/${encodeURIComponent(id)}/file`, { accept: "application/pdf" });
          return new Uint8Array(await antwort.arrayBuffer());
        } catch (fehler) {
          if (!(fehler instanceof LexwareFehler) || ![404, 406, 409].includes(fehler.status)) throw fehler;
          letzterFehler = fehler;
          await warte(1500);
        }
      }
      throw letzterFehler ?? new LexwareFehler(404, "Das PDF ist bei Lexware noch nicht verfügbar.");
    },
  };
}

export type LexwareClient = ReturnType<typeof erzeugeLexwareClient>;
