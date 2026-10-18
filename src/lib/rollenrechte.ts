// Übersicht „Rollen & Zugriffsrechte“ für die Einstellungen. Die Rechte sind fest in der Datenbank (RLS) und in den Server-Aktionen
// eingebaut und lassen sich hier nicht ändern; diese Tabelle beschreibt sie nur (Stand 18.10.2026). Bei einer Änderung der Rechte
// in der Datenbank muss sie angepasst werden.

import type { Rolle } from "@/lib/rollen";

/** ja = darf, nein = darf nicht, eigene = nur das Eigene bzw. was zu den eigenen Projekten gehört, lesen = nur ansehen */
export type Recht = "ja" | "nein" | "eigene" | "lesen";

export type RechteZeile = { funktion: string; rechte: Record<Rolle, Recht> };
export type RechteGruppe = { titel: string; zeilen: RechteZeile[] };

const z = (funktion: string, mitarbeiter: Recht, buero: Recht, admin: Recht): RechteZeile => ({ funktion, rechte: { mitarbeiter, buero, admin } });

export const RECHTE: RechteGruppe[] = [
  {
    titel: "Projekte & Kontakte",
    zeilen: [
      z("Projekte ansehen", "eigene", "ja", "ja"),
      z("Archivierte Projekte ansehen", "lesen", "ja", "ja"),
      z("Projekte anlegen, bearbeiten, archivieren", "nein", "ja", "ja"),
      z("Kollegen zu einem Projekt hinzufügen", "eigene", "ja", "ja"),
      z("Kontakte ansehen", "eigene", "ja", "ja"),
      z("Kontakte anlegen und bearbeiten", "nein", "ja", "ja"),
      z("Kontakte importieren", "nein", "nein", "ja"),
    ],
  },
  {
    titel: "Baustelle",
    zeilen: [
      z("Fotos, Dateien, Notizen, Material und Aufmaß eintragen", "eigene", "ja", "ja"),
      z("Projektchat lesen und schreiben", "eigene", "ja", "ja"),
      z("Berichte (Bautagesbericht) erstellen", "eigene", "ja", "ja"),
      z("Arbeitsanweisung und Materialliste lesen (nach Freigabe)", "eigene", "ja", "ja"),
      z("Einteilung (Plantafel) bearbeiten", "nein", "ja", "ja"),
      z("Eigene Einsätze und Termine sehen", "eigene", "ja", "ja"),
    ],
  },
  {
    titel: "Zeiten & Urlaub",
    zeilen: [
      z("Eigene Zeiten eintragen und ändern (innerhalb der Sperrfrist)", "eigene", "ja", "ja"),
      z("Zeiten für Kollegen derselben Baustelle eintragen", "eigene", "ja", "ja"),
      z("Zeiten aller sehen, nachtragen, ändern", "nein", "ja", "ja"),
      z("Urlaub und Abfeiern beantragen", "eigene", "ja", "ja"),
      z("Urlaub genehmigen oder ablehnen", "nein", "nein", "ja"),
      z("Soll, Überstundenkonto und Urlaubsanspruch ändern", "nein", "nein", "ja"),
    ],
  },
  {
    titel: "Angebote, Rechnungen & Preise",
    zeilen: [
      z("Katalog (Leistungen, Materialien) mit Preisen sehen und pflegen", "nein", "ja", "ja"),
      z("Katalog importieren", "nein", "nein", "ja"),
      z("Angebote erstellen, bearbeiten, versenden", "nein", "ja", "ja"),
      z("Rechnungen vorbereiten und an Lexware übertragen", "nein", "ja", "ja"),
      z("Kalkulation (Zuschläge, Lohngruppen) ansehen", "nein", "ja", "ja"),
      z("Kalkulation ändern", "nein", "nein", "ja"),
    ],
  },
  {
    titel: "Einstellungen",
    zeilen: [
      z("Mitarbeiter anlegen, Rollen ändern, Zugänge sperren", "nein", "nein", "ja"),
      z("Firmendaten, Logo, Textvorlagen, Nummernkreise, Projektstatus", "nein", "nein", "ja"),
      z("Übersicht, Suche und Benachrichtigungen im Büro", "nein", "ja", "ja"),
    ],
  },
];
