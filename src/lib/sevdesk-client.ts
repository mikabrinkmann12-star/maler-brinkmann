// Kleiner Client für die sevdesk-Schnittstelle (https://api.sevdesk.de, Version 1). Kein Zugriff auf Umgebungsvariablen:
// Der Token wird übergeben (siehe buchhaltung.ts, nur serverseitig). Dadurch lässt sich der Client ohne echten Zugang testen.
//
// Regeln der Schnittstelle (aus der OpenAPI-Beschreibung gelesen, 20.10.2026): Der Token steht im Kopf `Authorization` (ohne „Bearer“),
// Rechnungen entstehen NUR als Entwurf (Status 100); „versendet“ (Status 200, vom System vergebene Rechnungsnummer) wird sie
// durch `sendBy` oder `sendViaEmail`, danach lässt sie sich mit `enshrine` festschreiben (GoBD, nicht rücknehmbar).
// HINWEIS: Mit einem echten Konto ist dieser Client noch nicht getestet, nur gegen einen Schein-Server.

import { einheitSchluessel } from "@/lib/sevdesk-einheit";
import {
  rechnungInfoAusSevdesk,
  type SevdeskKontaktEingabe,
  type SevdeskRechnungInfo,
  type SevdeskRechnungKoerper,
} from "@/lib/sevdesk-rechnung";

export const SEVDESK_BASIS = "https://my.sevdesk.de/api/v1";

export class SevdeskFehler extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SevdeskFehler";
    this.status = status;
  }
}

type Optionen = {
  token: string;
  /** Adresse der Schnittstelle (nur für Tests mit einem Schein-Server) */
  basis?: string;
  fetchFn?: typeof fetch;
  /** Wartezeit zwischen Anfragen in ms (schont das Konto, sevdesk begrenzt die Anfragen) */
  abstandMs?: number;
  warte?: (ms: number) => Promise<void>;
};

/** Verständliche deutsche Meldung zu einer Fehlerantwort. */
export function sevdeskFehlerText(status: number, koerper: unknown): string {
  const k = typeof koerper === "object" && koerper !== null ? (koerper as Record<string, unknown>) : {};
  const fehler = typeof k.error === "object" && k.error !== null ? (k.error as Record<string, unknown>) : {};
  const meldung = typeof fehler.message === "string" ? fehler.message : typeof k.message === "string" ? k.message : "";
  const zusatz = meldung ? ` (${meldung.slice(0, 200)})` : "";
  if (status === 401) return "sevdesk hat den API-Token abgelehnt. Bitte den Token prüfen.";
  if (status === 403) return `Der API-Token hat keine Berechtigung für diese Aktion.${zusatz}`;
  if (status === 404) return "sevdesk kennt diesen Eintrag nicht.";
  if (status === 422) return `sevdesk hat die Daten nicht akzeptiert${zusatz || " (Validierungsfehler)"}.`;
  if (status === 429) return "sevdesk ist gerade ausgelastet (zu viele Anfragen). Bitte gleich nochmal versuchen.";
  if (status >= 500) return "sevdesk ist gerade nicht erreichbar. Bitte später nochmal versuchen.";
  return `sevdesk hat die Anfrage abgelehnt${zusatz || ` (Status ${status})`}.`;
}

const asObjekt = (w: unknown): Record<string, unknown> => (typeof w === "object" && w !== null ? (w as Record<string, unknown>) : {});

export function erzeugeSevdeskClient(opt: Optionen) {
  const fetchFn = opt.fetchFn ?? fetch;
  const basis = opt.basis ?? SEVDESK_BASIS;
  const abstand = opt.abstandMs ?? 250;
  const warte = opt.warte ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let letzte = 0;
  let einheitenCache: Map<string, number> | null = null;

  async function anfrage(pfad: string, o: { method?: string; body?: unknown } = {}): Promise<unknown> {
    for (let versuch = 0; versuch < 3; versuch++) {
      const seit = Date.now() - letzte;
      if (seit < abstand) await warte(abstand - seit);
      letzte = Date.now();

      let antwort: Response;
      try {
        antwort = await fetchFn(`${basis}${pfad}`, {
          method: o.method ?? "GET",
          headers: {
            Authorization: opt.token,
            Accept: "application/json",
            "User-Agent": "Maler-Brinkmann-App",
            ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new SevdeskFehler(0, "sevdesk ist nicht erreichbar. Bitte die Internetverbindung prüfen und nochmal versuchen.");
      }
      if (antwort.status === 429 && versuch < 2) {
        await warte(1500 * (versuch + 1));
        continue;
      }
      let koerper: unknown = null;
      try {
        koerper = await antwort.json();
      } catch {
        // keine JSON-Antwort
      }
      if (!antwort.ok) throw new SevdeskFehler(antwort.status, sevdeskFehlerText(antwort.status, koerper));
      return koerper;
    }
    throw new SevdeskFehler(429, sevdeskFehlerText(429, null));
  }

  /** `{ objects: … }` auspacken. */
  const objekte = (antwort: unknown): unknown => asObjekt(antwort).objects;
  const idVon = (w: unknown): string => {
    const id = asObjekt(w).id;
    return typeof id === "string" || typeof id === "number" ? String(id) : "";
  };

  return {
    /** Verbindung prüfen: Buchführungssystem (muss Version 2.0 sein) und der erste Benutzer (er steht später als Ansprechpartner in den Rechnungen). */
    async verbindungPruefen(): Promise<{ version: string; benutzerName: string; benutzerId: string; kassen: number }> {
      const v = asObjekt(objekte(await anfrage("/Tools/bookkeepingSystemVersion")));
      const benutzer = await this.ersterBenutzer();
      let kassen = 0;
      try {
        const k = objekte(await anfrage("/CheckAccount"));
        kassen = Array.isArray(k) ? k.length : 0;
      } catch {
        // nicht schlimm, nur für die Anzeige
      }
      return { version: typeof v.version === "string" ? v.version : "", benutzerName: benutzer.name, benutzerId: benutzer.id, kassen };
    },

    /** Der erste (aktive) Benutzer des Kontos: Er wird als Ansprechpartner in die Rechnung eingetragen (`contactPerson`). */
    async ersterBenutzer(): Promise<{ id: string; name: string }> {
      const liste = objekte(await anfrage("/SevUser"));
      const erster = Array.isArray(liste) ? asObjekt(liste[0]) : {};
      const id = idVon(erster);
      if (!id) throw new SevdeskFehler(500, "sevdesk hat keinen Benutzer zurückgegeben.");
      const name = [erster.firstName, erster.lastName].filter((t) => typeof t === "string" && t).join(" ") || (typeof erster.username === "string" ? erster.username : "");
      return { id, name };
    },

    /** Einheiten des Kontos (Name → ID). Kann sevdesk sie nicht liefern, bleibt die Karte leer und es gilt die Standard-Einheit. */
    async einheiten(): Promise<Map<string, number>> {
      if (einheitenCache) return einheitenCache;
      const karte = new Map<string, number>();
      try {
        const liste = objekte(await anfrage("/Unity?limit=200"));
        for (const e of Array.isArray(liste) ? liste : []) {
          const o = asObjekt(e);
          const id = Number(idVon(o));
          if (!Number.isFinite(id) || id <= 0) continue;
          for (const name of [o.name, o.translationCode]) {
            if (typeof name === "string" && name.trim()) karte.set(einheitSchluessel(name), id);
          }
        }
      } catch {
        // egal: Standard-Einheit
      }
      einheitenCache = karte;
      return karte;
    },

    /** Kunde in sevdesk anlegen (Firma oder Person) samt Adresse und E-Mail; gibt die sevdesk-ID zurück. */
    async kontaktAnlegen(k: SevdeskKontaktEingabe): Promise<string> {
      const kopf: Record<string, unknown> = {
        category: { id: 3, objectName: "Category" },
        ...(k.firma ? { name: k.firma } : { surename: k.vorname || undefined, familyname: k.nachname || "Unbekannt" }),
        ...(k.kundennummer ? { customerNumber: k.kundennummer } : {}),
        ...(k.leitwegId ? { buyerReference: k.leitwegId } : {}),
        ...(k.firma && k.ansprechpartner ? { description: `Ansprechpartner: ${k.ansprechpartner}` } : {}),
      };
      const id = idVon(objekte(await anfrage("/Contact", { method: "POST", body: kopf })));
      if (!id) throw new SevdeskFehler(500, "sevdesk hat keine Kunden-ID zurückgegeben.");
      const ref = { id: Number(id), objectName: "Contact" };
      if (k.strasse || k.plz || k.ort) {
        await anfrage("/ContactAddress", {
          method: "POST",
          body: { contact: ref, street: k.strasse || undefined, zip: k.plz || undefined, city: k.ort || undefined, country: { id: 1, objectName: "StaticCountry" } },
        });
      }
      if (k.email) {
        await anfrage("/CommunicationWay", {
          method: "POST",
          body: { contact: ref, type: "EMAIL", value: k.email, key: { id: 2, objectName: "CommunicationWayKey" }, main: true },
        });
      }
      return id;
    },

    /** Rechnungsentwurf anlegen (sevdesk erlaubt beim Anlegen nur den Status Entwurf); gibt die sevdesk-ID zurück. */
    async rechnungAnlegen(koerper: SevdeskRechnungKoerper): Promise<string> {
      const antwort = asObjekt(objekte(await anfrage("/Invoice/Factory/saveInvoice", { method: "POST", body: koerper })));
      const id = idVon(antwort.invoice) || idVon(antwort);
      if (!id) throw new SevdeskFehler(500, "sevdesk hat keine Rechnungs-ID zurückgegeben.");
      return id;
    },

    /** Rechnung als versendet markieren (Entwurf → Offen, vergibt die Rechnungsnummer), ohne E-Mail. `VPDF` = als PDF weitergegeben. */
    async alsVersendetMarkieren(id: string, art: "VPDF" | "VP" | "VM" | "VPR" = "VPDF"): Promise<void> {
      await anfrage(`/Invoice/${encodeURIComponent(id)}/sendBy`, { method: "PUT", body: { sendType: art, sendDraft: false } });
    },

    /** Rechnung festschreiben (GoBD, nicht rücknehmbar; nur möglich, wenn sie schon offen ist). */
    async festschreiben(id: string): Promise<void> {
      await anfrage(`/Invoice/${encodeURIComponent(id)}/enshrine`, { method: "PUT" });
    },

    /** Rechnung (oder Mahnung) per E-Mail an den Kunden schicken; sevdesk hängt PDF bzw. XML an und setzt den Status auf versendet. */
    async perMailSenden(id: string, mail: { an: string; betreff: string; text: string; kopieAnMich?: boolean; xmlStattPdf?: boolean }): Promise<void> {
      await anfrage(`/Invoice/${encodeURIComponent(id)}/sendViaEmail`, {
        method: "POST",
        body: { toEmail: mail.an, subject: mail.betreff, text: mail.text, copy: mail.kopieAnMich ?? false, ...(mail.xmlStattPdf ? { sendXml: true } : {}) },
      });
    },

    /** Nummer, Status und Summen einer Rechnung. */
    async rechnungLesen(id: string): Promise<SevdeskRechnungInfo> {
      const liste = objekte(await anfrage(`/Invoice/${encodeURIComponent(id)}`));
      return rechnungInfoAusSevdesk(Array.isArray(liste) ? liste[0] : liste);
    },

    /** PDF der Rechnung (sevdesk liefert es als Base64 in einer JSON-Antwort). Bei einer E-Rechnung steckt der XML-Teil schon darin (ZUGFeRD). */
    async rechnungPdf(id: string): Promise<Uint8Array> {
      const o = asObjekt(objekte(await anfrage(`/Invoice/${encodeURIComponent(id)}/getPdf`)));
      if (typeof o.content !== "string" || !o.content) throw new SevdeskFehler(404, "Das PDF ist bei sevdesk noch nicht verfügbar.");
      return new Uint8Array(Buffer.from(o.content, o.base64encoded === false ? "utf8" : "base64"));
    },

    /** XML der E-Rechnung (nur bei E-Rechnungen, sonst Fehler). */
    async rechnungXml(id: string): Promise<Uint8Array> {
      const xml = objekte(await anfrage(`/Invoice/${encodeURIComponent(id)}/getXml`));
      if (typeof xml !== "string" || !xml) throw new SevdeskFehler(404, "Die XML-Datei ist bei sevdesk nicht verfügbar.");
      return new TextEncoder().encode(xml);
    },

    /** Girokonto/Kasse, auf die Zahlungen gebucht werden: das erste aktive. */
    async zahlungskonto(): Promise<string> {
      const liste = objekte(await anfrage("/CheckAccount"));
      const konten = (Array.isArray(liste) ? liste : []).map(asObjekt);
      const aktiv = konten.find((k) => String(k.status ?? "100") === "100") ?? konten[0];
      const id = idVon(aktiv);
      if (!id) throw new SevdeskFehler(404, "In sevdesk ist kein Konto für Zahlungen angelegt. Bitte dort ein Konto oder eine Kasse einrichten.");
      return id;
    },

    /** Zahlung buchen (Eingang). `datum` als ISO-Datum; `skonto` = der Betrag wurde wegen Skonto gekürzt. */
    async zahlungBuchen(id: string, daten: { betrag: number; datum: string; kontoId: string; skonto?: boolean }): Promise<void> {
      await anfrage(`/Invoice/${encodeURIComponent(id)}/bookAmount`, {
        method: "PUT",
        body: {
          amount: daten.betrag,
          date: Math.floor(Date.parse(`${daten.datum}T12:00:00Z`) / 1000),
          type: daten.skonto ? "CB" : "FULL_PAYMENT",
          checkAccount: { id: Number(daten.kontoId), objectName: "CheckAccount" },
        },
      });
    },

    /** Zahlungserinnerung bzw. Mahnung zu einer Rechnung anlegen; gibt die ID der Mahnung (in sevdesk eine Rechnung vom Typ MA) zurück. */
    async mahnungAnlegen(rechnungId: string): Promise<string> {
      const id = idVon(objekte(await anfrage(`/Invoice/Factory/createInvoiceReminder?invoice[id]=${encodeURIComponent(rechnungId)}&invoice[objectName]=Invoice`, {
        method: "POST",
        body: { invoice: { id: Number(rechnungId), objectName: "Invoice" } },
      })));
      if (!id) throw new SevdeskFehler(500, "sevdesk hat keine Mahnung zurückgegeben.");
      return id;
    },

    /** Stornorechnung anlegen (die Rechnung gilt danach als storniert); gibt die ID der Stornorechnung zurück. */
    async stornieren(id: string): Promise<string> {
      return idVon(objekte(await anfrage(`/Invoice/${encodeURIComponent(id)}/cancelInvoice`, { method: "POST" })));
    },
  };
}

export type SevdeskClient = ReturnType<typeof erzeugeSevdeskClient>;
