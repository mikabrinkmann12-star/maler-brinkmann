// Website-Anfragen: Prüfung der Meldung vom Kontaktformular der Website, Name aufteilen, Kontakt-Vorschlag und Dubletten.
// Reine Logik, ohne Datenbank, auch im Browser nutzbar.
// Die Website (anfrage.php auf Strato) schickt an `/api/anfragen`:
//   { id (uuid), name, telefon, email, betreff, nachricht, strasse, plz, ort, quelle: "website", datenschutz: true }
// Unbekannte Felder werden ignoriert.

import { z } from "zod";
import { nummernSchluessel } from "@/lib/anruf";
import { formatDatum } from "@/lib/format";
import { dublettenSchluessel } from "@/lib/kontakt-import";

export type AnfrageStatus = "neu" | "angenommen" | "abgelehnt";
export const ANFRAGE_STATUS: AnfrageStatus[] = ["neu", "angenommen", "abgelehnt"];
export const ANFRAGE_STATUS_NAMEN: Record<AnfrageStatus, string> = { neu: "Neu", angenommen: "Angenommen", abgelehnt: "Abgelehnt" };

export function istAnfrageStatus(w: unknown): w is AnfrageStatus {
  return typeof w === "string" && (ANFRAGE_STATUS as string[]).includes(w);
}

/** Leerzeichen am Rand weg, Steuerzeichen (außer Zeilenumbruch/Tab) raus. */
function sauber(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
const text = (max: number, meldung: string) => z.string().transform(sauber).pipe(z.string().max(max, meldung));
const optional = (max: number, meldung: string) =>
  z.string().nullish().transform((v) => sauber(v ?? "")).pipe(z.string().max(max, meldung));

/** Grenzen wie in der Datenbank (Prüfregeln von `website_anfragen`). */
export const anfrageSchema = z
  .object({
    id: z.uuid("Die Anfrage-ID (id) fehlt oder ist ungültig."),
    name: text(200, "Der Name ist zu lang.").pipe(z.string().min(1, "Der Name fehlt.")),
    telefon: optional(40, "Die Telefonnummer ist zu lang."),
    email: optional(200, "Die E-Mail-Adresse ist zu lang.").pipe(z.union([z.literal(""), z.email("Die E-Mail-Adresse ist ungültig.")])),
    betreff: optional(200, "Der Betreff ist zu lang."),
    nachricht: text(10000, "Die Nachricht ist zu lang.").pipe(z.string().min(1, "Die Nachricht fehlt.")),
    strasse: optional(120, "Die Straße ist zu lang."),
    plz: optional(10, "Die PLZ ist zu lang."),
    ort: optional(80, "Der Ort ist zu lang."),
    quelle: z
      .string()
      .nullish()
      .transform((v) => (v ?? "").trim().toLowerCase() || "website")
      .pipe(z.string().regex(/^[a-z0-9_-]{1,40}$/, "Ungültige Quelle.")),
  })
  .refine((a) => Boolean(a.telefon || a.email), { message: "Telefon oder E-Mail fehlt.", path: ["telefon"] });

export type NeueAnfrage = z.output<typeof anfrageSchema>;

export type AnfrageNormalisiert = { ok: true; anfrage: NeueAnfrage } | { ok: false; fehler: string };

/** Nimmt den JSON-Inhalt des Webhooks und liefert die Anfrage oder einen Fehlertext. */
export function anfrageNormalisieren(roh: unknown): AnfrageNormalisiert {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return { ok: false, fehler: "Der Inhalt ist kein JSON-Objekt." };
  const p = anfrageSchema.safeParse(roh);
  if (!p.success) return { ok: false, fehler: p.error.issues[0]?.message ?? "Ungültige Anfrage." };
  return { ok: true, anfrage: p.data };
}

// ---------------------------------------------------------------------------
// Name aufteilen
// ---------------------------------------------------------------------------

const ANREDEN = new Map([
  ["herr", "Herr"],
  ["hr", "Herr"],
  ["frau", "Frau"],
  ["fr", "Frau"],
  ["familie", "Familie"],
  ["fam", "Familie"],
]);
const TITEL = /^(dr|prof|dipl[-.\w]*)\.?$/i;
/** Namenszusätze, mit denen der Nachname beginnt („Ludwig van Beethoven“, „Anna de Vries“). */
const ZUSAETZE = new Set(["von", "van", "vom", "zu", "zur", "de", "den", "der", "ter", "ten", "la", "le", "du", "di", "da"]);

export type NameTeile = { anrede: string; vorname: string; nachname: string };

/**
 * „Max Mustermann“ → Vorname Max, Nachname Mustermann. „Mustermann, Max“ geht auch.
 * Anrede (Herr/Frau/Familie) wird erkannt, Titel (Dr., Prof.) bleiben beim Vornamen. Ein einzelnes Wort gilt als Nachname.
 */
export function nameAufteilen(roh: string): NameTeile {
  const s = roh.replace(/\s+/g, " ").trim();
  if (!s) return { anrede: "", vorname: "", nachname: "" };

  const komma = s.indexOf(",");
  if (komma > 0) {
    const nach = s.slice(0, komma).trim();
    const rest = nameAufteilen(s.slice(komma + 1));
    return { anrede: rest.anrede, vorname: [rest.vorname, rest.nachname].filter(Boolean).join(" "), nachname: nach };
  }

  const woerter = s.split(" ");
  let anrede = "";
  const erste = woerter[0].replace(/\.$/, "").toLowerCase();
  if (woerter.length > 1 && ANREDEN.has(erste)) {
    anrede = ANREDEN.get(erste)!;
    woerter.shift();
  }
  if (woerter.length === 1) return { anrede, vorname: "", nachname: woerter[0] };
  // „Herr Dr. Müller“: nur Titel + Nachname
  if (woerter.length === 2 && TITEL.test(woerter[0])) return { anrede, vorname: woerter[0], nachname: woerter[1] };

  // Nachname beginnt beim ersten Namenszusatz (nicht beim ersten Wort), sonst ist es das letzte Wort
  let start = woerter.length - 1;
  for (let i = 1; i < woerter.length - 1; i++) {
    if (ZUSAETZE.has(woerter[i].toLowerCase())) {
      start = i;
      break;
    }
  }
  return { anrede, vorname: woerter.slice(0, start).join(" "), nachname: woerter.slice(start).join(" ") };
}

// ---------------------------------------------------------------------------
// Kontakt-Vorschlag und Dubletten
// ---------------------------------------------------------------------------

export type AnfrageDaten = {
  name: string;
  vorname?: string | null;
  nachname?: string | null;
  telefon: string | null;
  email: string | null;
  betreff: string;
  nachricht: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  created_at: string;
};

export type KontaktVorschlag = {
  anrede: string;
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  notizen: string;
};

/** Notiz für den neuen Kontakt: Betreff, Nachricht und Datum der Anfrage (höchstens 2.000 Zeichen wie im Kontaktformular). */
export function anfrageNotiz(a: Pick<AnfrageDaten, "betreff" | "nachricht" | "created_at">): string {
  const kopf = `Website-Anfrage vom ${formatDatum(a.created_at)}${a.betreff ? `: ${a.betreff}` : ""}`;
  const notiz = `${kopf}\n${a.nachricht.trim()}`;
  return notiz.length > 2000 ? `${notiz.slice(0, 1999)}…` : notiz;
}

/** Vorbelegung für „Annehmen“: alles aus der Anfrage, Name aufgeteilt (vom Absender aufgeteilte Namen gehen vor). */
export function kontaktVorschlag(a: AnfrageDaten): KontaktVorschlag {
  const teile = nameAufteilen(a.name);
  const vorname = a.vorname?.trim() || (a.nachname?.trim() ? "" : teile.vorname);
  const nachname = a.nachname?.trim() || teile.nachname;
  return {
    anrede: teile.anrede,
    vorname,
    nachname,
    strasse: a.strasse ?? "",
    plz: a.plz ?? "",
    ort: a.ort ?? "",
    telefon: a.telefon ?? "",
    email: a.email ?? "",
    notizen: anfrageNotiz(a),
  };
}

export type KontaktFuerDublette = {
  id: string;
  firmenname: string | null;
  vorname: string | null;
  nachname: string | null;
  strasse: string | null;
  plz: string | null;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
};

export type DublettenGrund = "email" | "telefon" | "name";
export type Dublette = { id: string; gruende: DublettenGrund[] };

export const DUBLETTEN_GRUND_TEXT: Record<DublettenGrund, string> = { email: "gleiche E-Mail", telefon: "gleiche Telefonnummer", name: "gleicher Name und Adresse" };

/**
 * Gibt es den Anfragenden schon als Kontakt? Treffer über E-Mail (ohne Groß/Klein), Telefon (letzte 9 Ziffern, Telefon oder Mobil)
 * oder Name + Adresse (Dubletten-Schlüssel wie beim Kontakt-Import). Höchstens `max` Treffer, die mit den meisten Gründen zuerst.
 */
export function dublettenFinden(a: Pick<KontaktVorschlag, "vorname" | "nachname" | "strasse" | "plz" | "telefon" | "email">, kontakte: readonly KontaktFuerDublette[], max = 5): Dublette[] {
  const mail = a.email.trim().toLowerCase();
  const tel = nummernSchluessel(a.telefon);
  const name = a.nachname.trim() ? dublettenSchluessel({ firmenname: "", vorname: a.vorname, nachname: a.nachname, strasse: a.strasse, plz: a.plz }) : null;

  const treffer: Dublette[] = [];
  for (const k of kontakte) {
    const gruende: DublettenGrund[] = [];
    if (mail && k.email?.trim().toLowerCase() === mail) gruende.push("email");
    if (tel && (nummernSchluessel(k.telefon) === tel || nummernSchluessel(k.mobil) === tel)) gruende.push("telefon");
    if (
      name &&
      dublettenSchluessel({ firmenname: k.firmenname ?? "", vorname: k.vorname ?? "", nachname: k.nachname ?? "", strasse: k.strasse ?? "", plz: k.plz ?? "" }) === name
    )
      gruende.push("name");
    if (gruende.length) treffer.push({ id: k.id, gruende });
  }
  return treffer.sort((x, y) => y.gruende.length - x.gruende.length).slice(0, max);
}
