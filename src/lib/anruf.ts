// Anrufe (Telefon-KI): Umwandlung der Meldung eines Telefon-Dienstes in einen Eintrag der App. Reine Logik, ohne Datenbank, auch im Browser nutzbar.
// Der Dienst schickt das Ergebnis eines Anrufs an `/api/anrufe`. Es gibt zwei Formen:
//   generisch: { id, von, an, richtung, beginn, dauer_sek, zusammenfassung, kategorie, transkript }
//   retell:    { event: "call_analyzed", call: { call_id, from_number, to_number, direction, start_timestamp, end_timestamp, transcript, call_analysis: { call_summary } } }
// Die Retell-Form ist nach der Dokumentation aus dem Gedächtnis gebaut und noch NICHT mit einem echten Anruf geprüft.

export type AnrufKategorie = "anfrage" | "information" | "spam" | "sonstiges";
export type AnrufStatus = "neu" | "in_bearbeitung" | "erledigt";
export type AnrufAnbieter = "manuell" | "generisch" | "retell";

export const KATEGORIEN: AnrufKategorie[] = ["anfrage", "information", "spam", "sonstiges"];
export const KATEGORIE_NAMEN: Record<AnrufKategorie, string> = { anfrage: "Anfrage", information: "Information", spam: "Spam", sonstiges: "Sonstiges" };
export const STATUS_WERTE: AnrufStatus[] = ["neu", "in_bearbeitung", "erledigt"];
export const STATUS_NAMEN: Record<AnrufStatus, string> = { neu: "Neu", in_bearbeitung: "In Bearbeitung", erledigt: "Erledigt" };

export type NeuerAnruf = {
  anbieter: AnrufAnbieter;
  anbieterId: string | null;
  richtung: "eingehend" | "ausgehend";
  vonNummer: string | null;
  anNummer: string | null;
  beginn: string;
  dauerSek: number | null;
  zusammenfassung: string;
  transkript: string | null;
  kategorie: AnrufKategorie;
};

export function istKategorie(w: unknown): w is AnrufKategorie {
  return typeof w === "string" && (KATEGORIEN as string[]).includes(w);
}
export function istStatus(w: unknown): w is AnrufStatus {
  return typeof w === "string" && (STATUS_WERTE as string[]).includes(w);
}

/** Nur Ziffern und ein führendes „+“; „0049 4492 …“ und „+49 4492 …“ werden gleich, „0“ am Anfang wird zu „+49“. */
export function nummerNormalisieren(roh: string | null | undefined): string | null {
  if (!roh) return null;
  let s = roh.trim().replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  else if (s.startsWith("0")) s = `+49${s.slice(1)}`;
  if (s.replace(/\D/g, "").length < 5) return null;
  return s.replace(/(?!^)\+/g, "");
}

/** Letzte 9 Ziffern: reicht, um dieselbe Nummer in verschiedenen Schreibweisen wiederzuerkennen. */
export function nummernSchluessel(roh: string | null | undefined): string | null {
  const n = nummerNormalisieren(roh);
  return n ? n.replace(/\D/g, "").slice(-9) : null;
}

const SPAM = /\b(werbung|spam|umfrage|gewinnspiel|verkaufsgespr|telefonmarketing|robocall|energieberatung|kostenlos(?:e|er|es)? angebot)\b/i;
const ANFRAGE = /\b(angebot|kostenvoranschlag|termin|besichtigung|anfrage|streichen|malen|tapezieren|renovier|sanier|fassade|lackier|farbe|auftrag|beauftrag|zeit für)\b/i;
const INFO = /\b(rückruf|rückfrage|information|nachfrage|frage zu|verschoben|bescheid|lieferung|rechnung|mitteilung|durchgesagt|ausrichten)\b/i;

/** Regeln, falls der Dienst keine Kategorie liefert: Spam zuerst, dann Anfrage, dann Information, sonst Sonstiges. */
export function kategorieErkennen(text: string): AnrufKategorie {
  const t = text.trim();
  if (!t) return "sonstiges";
  if (SPAM.test(t)) return "spam";
  if (ANFRAGE.test(t)) return "anfrage";
  if (INFO.test(t)) return "information";
  return "sonstiges";
}

function kategorieAusDienst(wert: unknown, text: string): AnrufKategorie {
  const w = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  if (istKategorie(w)) return w;
  const karte: Record<string, AnrufKategorie> = { inquiry: "anfrage", request: "anfrage", lead: "anfrage", info: "information", information: "information", spam: "spam", other: "sonstiges" };
  return karte[w] ?? kategorieErkennen(text);
}

function text(wert: unknown, max: number): string {
  return typeof wert === "string" ? wert.trim().slice(0, max) : "";
}
function zeitpunkt(wert: unknown): string {
  if (typeof wert === "number" && Number.isFinite(wert)) {
    const d = new Date(wert > 1e11 ? wert : wert * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof wert === "string") {
    const d = new Date(wert);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}
function dauer(wert: unknown): number | null {
  return typeof wert === "number" && Number.isFinite(wert) && wert >= 0 && wert <= 86400 ? Math.round(wert) : null;
}
function objekt(w: unknown): Record<string, unknown> | null {
  return w && typeof w === "object" && !Array.isArray(w) ? (w as Record<string, unknown>) : null;
}
function transkriptText(w: unknown): string | null {
  if (typeof w === "string") return w.trim().slice(0, 60000) || null;
  if (Array.isArray(w)) {
    const zeilen = w
      .map((z) => objekt(z))
      .filter((z): z is Record<string, unknown> => z !== null)
      .map((z) => `${text(z.role, 20) === "agent" ? "KI" : "Anrufer"}: ${text(z.content, 2000)}`);
    return zeilen.join("\n").slice(0, 60000) || null;
  }
  return null;
}

export type Normalisiert = { ok: true; anruf: NeuerAnruf } | { ok: false; fehler: string };

/** Nimmt den JSON-Inhalt des Webhooks und liefert einen Eintrag oder einen Fehlertext. Unbekannte Felder werden ignoriert. */
export function anrufNormalisieren(roh: unknown): Normalisiert {
  const o = objekt(roh);
  if (!o) return { ok: false, fehler: "Der Inhalt ist kein JSON-Objekt." };

  // Retell: erst das Ergebnis der Auswertung nehmen („call_analyzed“); andere Ereignisse (Beginn, Ende) ignorieren wir
  if (typeof o.event === "string" && objekt(o.call)) {
    if (o.event !== "call_analyzed") return { ok: false, fehler: `Ereignis „${o.event}“ wird nicht gebraucht.` };
    const c = objekt(o.call)!;
    const analyse = objekt(c.call_analysis);
    const zusammenfassung = text(analyse?.call_summary, 4000);
    const beginnMs = typeof c.start_timestamp === "number" ? c.start_timestamp : null;
    const endeMs = typeof c.end_timestamp === "number" ? c.end_timestamp : null;
    const id = text(c.call_id, 200);
    if (!id) return { ok: false, fehler: "Die Anruf-ID fehlt." };
    return {
      ok: true,
      anruf: {
        anbieter: "retell",
        anbieterId: id,
        richtung: c.direction === "outbound" ? "ausgehend" : "eingehend",
        vonNummer: text(c.from_number, 40) || null,
        anNummer: text(c.to_number, 40) || null,
        beginn: zeitpunkt(beginnMs),
        dauerSek: beginnMs !== null && endeMs !== null ? dauer((endeMs - beginnMs) / 1000) : null,
        zusammenfassung,
        transkript: transkriptText(c.transcript_object ?? c.transcript),
        kategorie: kategorieAusDienst(analyse?.custom_analysis_data && objekt(analyse.custom_analysis_data)?.kategorie, zusammenfassung),
      },
    };
  }

  const id = text(o.id, 200);
  if (!id) return { ok: false, fehler: "Die Anruf-ID (id) fehlt." };
  const zusammenfassung = text(o.zusammenfassung, 4000);
  const transkript = transkriptText(o.transkript);
  if (!zusammenfassung && !transkript) return { ok: false, fehler: "Es fehlt eine Zusammenfassung oder ein Transkript." };
  return {
    ok: true,
    anruf: {
      anbieter: "generisch",
      anbieterId: id,
      richtung: o.richtung === "ausgehend" ? "ausgehend" : "eingehend",
      vonNummer: text(o.von, 40) || null,
      anNummer: text(o.an, 40) || null,
      beginn: zeitpunkt(o.beginn),
      dauerSek: dauer(o.dauer_sek),
      zusammenfassung,
      transkript,
      kategorie: kategorieAusDienst(o.kategorie, `${zusammenfassung} ${transkript ?? ""}`),
    },
  };
}

/** „3:25 Min“ bzw. „45 Sek“ */
export function dauerText(sek: number | null): string {
  if (sek === null) return "–";
  if (sek < 60) return `${sek} Sek`;
  return `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")} Min`;
}

/** Vergleich in konstanter Zeit, damit man das Geheimnis nicht über die Antwortzeit erraten kann. */
export function geheimnisPasst(erhalten: string | null | undefined, erwartet: string | undefined): boolean {
  if (!erwartet || !erhalten) return false;
  const a = new TextEncoder().encode(erhalten);
  const b = new TextEncoder().encode(erwartet);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
