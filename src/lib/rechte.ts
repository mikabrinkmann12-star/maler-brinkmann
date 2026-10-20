// Rechte pro Rolle (Einstellungen → Rollen & Zugriffsrechte). Auch im Browser nutzbar.
//
// Der Admin hat immer alles und steht nicht in der Tabelle `role_permissions`. Für Büro und Mitarbeiter hat jedes Recht eine Stufe:
//   nein   = darf nicht
//   eigene = nur das Eigene bzw. was zu den eigenen Projekten gehört (nur Mitarbeiter)
//   ja     = darf (Büro: alles; Mitarbeiter bei Rechten ohne „eigene“: darf)
// Durchgesetzt wird das in der Datenbank (zusätzliche RLS-Regeln, Migration `…20261020180000_rechte`) und in den Server-Aktionen.
// Neues Recht = Eintrag hier + Schlüssel in der CHECK-Regel `role_permissions_recht_check` (neue Migration) + Regel in der Datenbank.

import type { Rolle } from "@/lib/rollen";

export type Stufe = "nein" | "eigene" | "ja";

export const STUFEN: readonly Stufe[] = ["nein", "eigene", "ja"];

export type RechtDef = {
  schluessel: string;
  name: string;
  hinweis?: string;
  /** Wählbare Stufen je Rolle. `null` = gibt es für diese Rolle nicht (fest „nein“, z. B. Büro-Funktionen in der Mitarbeiter-App). */
  buero: readonly Stufe[];
  mitarbeiter: readonly Stufe[] | null;
  /** Voreinstellung = Verhalten vor der Einführung der einstellbaren Rechte (wird in der Migration so eingetragen). */
  standard: { buero: Stufe; mitarbeiter: Stufe };
  /** Das Recht verleiht Macht, die sonst nur der Admin hat (Mitarbeiter können es nie bekommen). */
  verleih?: boolean;
};

const BUERO_JN = ["nein", "ja"] as const;
const MA_EIGENE = ["nein", "eigene"] as const;
const MA_JN = ["nein", "ja"] as const;

function recht(
  schluessel: string,
  name: string,
  buero: Stufe,
  mitarbeiter: Stufe,
  optionen: { ma: readonly Stufe[] | null; hinweis?: string; verleih?: boolean },
): RechtDef {
  return { schluessel, name, hinweis: optionen.hinweis, buero: BUERO_JN, mitarbeiter: optionen.ma, standard: { buero, mitarbeiter }, verleih: optionen.verleih };
}

export const RECHT_GRUPPEN: { titel: string; rechte: RechtDef[] }[] = [
  {
    titel: "Projekte & Kontakte",
    rechte: [
      recht("projekte_ansehen", "Projekte ansehen", "ja", "eigene", { ma: MA_EIGENE, hinweis: "Mitarbeiter sehen nur Projekte, auf denen sie eingetragen sind." }),
      recht("archiv_ansehen", "Archivierte Projekte ansehen (nur lesen)", "ja", "ja", { ma: MA_JN, hinweis: "Zum Nachsehen alter Baustellen, z. B. welche Farbe verwendet wurde." }),
      recht("projekte_bearbeiten", "Projekte anlegen, bearbeiten, archivieren", "ja", "nein", { ma: null }),
      recht("kollegen_hinzufuegen", "Kollegen zu einem Projekt hinzufügen", "ja", "eigene", { ma: MA_EIGENE, hinweis: "Mitarbeiter nur zu Projekten, auf denen sie selbst eingetragen sind." }),
      recht("kontakte_ansehen", "Kontakte ansehen", "ja", "eigene", { ma: MA_EIGENE, hinweis: "Mitarbeiter sehen nur die Kunden ihrer Projekte." }),
      recht("kontakte_bearbeiten", "Kontakte anlegen und bearbeiten", "ja", "nein", { ma: null }),
      recht("kontakte_importieren", "Kontakte importieren (CSV)", "nein", "nein", { ma: null, verleih: true, hinweis: "Braucht zusätzlich „Kontakte anlegen und bearbeiten“." }),
    ],
  },
  {
    titel: "Baustelle",
    rechte: [
      recht("baustelle_eintragen", "Fotos, Dateien, Notizen, Material und Aufmaß eintragen", "ja", "eigene", { ma: MA_EIGENE }),
      recht("chat", "Projektchat lesen und schreiben", "ja", "eigene", { ma: MA_EIGENE }),
      recht("berichte", "Berichte (Bautagesbericht, Regiebericht …) erstellen und lesen", "ja", "eigene", { ma: MA_EIGENE }),
      recht("anweisungen_ansehen", "Arbeitsanweisung und Materialliste lesen (nach Freigabe)", "ja", "eigene", { ma: MA_EIGENE }),
      recht("einteilung_bearbeiten", "Einteilung (Plantafel) bearbeiten, Fahrzeuge anlegen", "ja", "nein", { ma: null }),
      recht("einsaetze_ansehen", "Einsätze ansehen", "ja", "eigene", { ma: MA_EIGENE, hinweis: "Mitarbeiter sehen nur ihre eigenen Einsätze samt Team." }),
      recht("termine", "Termine ansehen und eintragen", "ja", "eigene", { ma: MA_EIGENE, hinweis: "Mitarbeiter nur eigene Termine." }),
      recht("container_melden", "Container melden", "ja", "ja", { ma: MA_JN }),
      recht("container_verwalten", "Container-Meldungen bearbeiten, Sperre aufheben", "ja", "nein", { ma: null }),
    ],
  },
  {
    titel: "Zeiten & Urlaub",
    rechte: [
      recht("zeiten_eigene", "Eigene Zeiten eintragen und ändern (innerhalb der Sperrfrist), Stempeluhr", "ja", "eigene", { ma: MA_EIGENE }),
      recht("zeiten_fuer_kollegen", "Zeiten für Kollegen derselben Baustelle eintragen", "ja", "eigene", { ma: MA_EIGENE }),
      recht("zeiten_alle", "Zeiten aller sehen, nachtragen, ändern", "ja", "nein", { ma: null }),
      recht("urlaub_beantragen", "Urlaub und Abfeiern beantragen", "ja", "eigene", { ma: MA_EIGENE }),
      recht("urlaub_genehmigen", "Urlaub und Abfeiern genehmigen, ablehnen, zurücknehmen", "nein", "nein", { ma: null, verleih: true }),
    ],
  },
  {
    titel: "Angebote, Rechnungen & Preise",
    rechte: [
      recht("katalog", "Katalog (Leistungen, Materialien) mit Preisen sehen und pflegen", "ja", "nein", { ma: null }),
      recht("katalog_importieren", "Katalog importieren (CSV)", "nein", "nein", { ma: null, verleih: true, hinweis: "Braucht zusätzlich „Katalog sehen und pflegen“." }),
      recht("angebote", "Angebote erstellen, bearbeiten, versenden (mit Arbeitsanweisung)", "ja", "nein", { ma: null }),
      recht("rechnungen", "Ausgangsrechnungen vorbereiten und an die Buchhaltung übertragen", "ja", "nein", { ma: null }),
      recht("eingangsrechnungen", "Eingangsrechnungen ansehen und bearbeiten", "ja", "nein", { ma: null }),
      recht("kalkulation_ansehen", "Kalkulation (Zuschläge, Lohngruppen) ansehen", "ja", "nein", { ma: null }),
      recht("kalkulation_aendern", "Kalkulation ändern", "nein", "nein", { ma: null, verleih: true }),
    ],
  },
  {
    titel: "Büro & Einstellungen",
    rechte: [
      recht("buero_zugang", "Hinweise (Glocke) und Verlauf im Büro sehen", "ja", "nein", { ma: null }),
      recht("einstellungen_firma", "Firmendaten, Logo, Textvorlagen, Nummernkreise, Projektstatus, Einheiten, Zeiterfassung und Rechnungs-Vorgaben ändern", "nein", "nein", { ma: null, verleih: true }),
    ],
  },
];

/** Bleibt immer beim Admin und lässt sich nicht einstellen (sonst könnte sich jemand selbst mehr Rechte geben). */
export const FESTE_RECHTE: { name: string; hinweis?: string }[] = [
  { name: "Mitarbeiter anlegen, Rollen ändern, Zugänge sperren, Passwörter zurücksetzen" },
  { name: "Rollen & Zugriffsrechte ändern (diese Seite)" },
  { name: "Soll, Überstundenkonto und Urlaubsanspruch ändern", hinweis: "Stehen im Mitarbeiter-Profil." },
  { name: "API-Schlüssel, Buchhaltungs-Anbindung (sevdesk, Lexware), Postfach-Einrichtung" },
];

export const ALLE_RECHTE: RechtDef[] = RECHT_GRUPPEN.flatMap((g) => g.rechte);
export const RECHT_SCHLUESSEL = ALLE_RECHTE.map((r) => r.schluessel);
export type Recht = string;

const DEF = new Map(ALLE_RECHTE.map((r) => [r.schluessel, r]));
export function rechtDef(schluessel: string): RechtDef | undefined {
  return DEF.get(schluessel);
}

/** Alle Rechte einer Rolle (Schlüssel → Stufe). */
export type Rechte = Record<string, Stufe>;

/** Voreinstellung einer Rolle. Der Admin hat immer „ja“. */
export function standardRechte(rolle: Rolle): Rechte {
  return Object.fromEntries(
    ALLE_RECHTE.map((r) => [r.schluessel, rolle === "admin" ? "ja" : rolle === "buero" ? r.standard.buero : r.standard.mitarbeiter]),
  );
}

/** Rechte einer Rolle aus den Zeilen der Datenbank. Admin: alles „ja“. Fehlt eine Zeile, gilt „nein“ (sicher als Voreinstellung). */
export function rechteAusZeilen(rolle: Rolle, zeilen: { recht: string; stufe: string }[]): Rechte {
  if (rolle === "admin") return standardRechte("admin");
  const karte = new Map(zeilen.map((z) => [z.recht, z.stufe]));
  return Object.fromEntries(
    ALLE_RECHTE.map((r) => {
      // Büro-Funktionen gibt es für Mitarbeiter nie, auch wenn jemand in der Datenbank etwas anderes einträgt
      if (rolle === "mitarbeiter" && !r.mitarbeiter) return [r.schluessel, "nein" as Stufe];
      const s = karte.get(r.schluessel);
      return [r.schluessel, (s === "eigene" || s === "ja" ? s : "nein") as Stufe];
    }),
  );
}

/** Ist das Recht an (eigene oder ja)? Unbekannte Rechte gelten als „nein“. */
export function rechtOk(rechte: Rechte | undefined, schluessel: string): boolean {
  const s = rechte?.[schluessel];
  return s === "eigene" || s === "ja";
}

/** Anzeigetext einer Stufe, passend zur Rolle und zum Recht. */
export function stufeText(stufe: Stufe, rolle: Rolle): string {
  if (stufe === "nein") return "Nein";
  if (stufe === "eigene") return rolle === "mitarbeiter" ? "Nur eigene" : "Eigene";
  return "Ja";
}

/** Darf diese Rolle diese Stufe für dieses Recht haben? Prüft auch auf dem Server vor dem Speichern. */
export function stufeErlaubt(rolle: Rolle, schluessel: string, stufe: string): stufe is Stufe {
  const def = rechtDef(schluessel);
  if (!def || rolle === "admin") return false;
  const optionen = rolle === "buero" ? def.buero : def.mitarbeiter;
  if (!optionen) return stufe === "nein";
  return (optionen as readonly string[]).includes(stufe);
}

/** Welche Einträge im Büro-Menü sind für diese Rechte sichtbar? */
export const MENUE_RECHTE: Record<string, string> = {
  "/buero/plantafel": "einteilung_bearbeiten",
  "/buero/projekte": "projekte_ansehen",
  "/buero/angebote": "angebote",
  "/buero/rechnungen": "rechnungen",
  "/buero/eingangsrechnungen": "eingangsrechnungen",
  "/buero/zeiten": "zeiten_alle",
  "/buero/katalog": "katalog",
  "/buero/kontakte": "kontakte_ansehen",
};
