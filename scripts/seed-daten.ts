// Erfundene Testdaten für brinkmann-dev (npm run seed).
// Alle Namen, Firmen und Adressen sind ausgedacht. Telefonnummern stammen aus
// dem für Film/Fernsehen reservierten Bereich (040 66969 …), E-Mails enden auf
// example.com (reservierte Domain). So erwischt man nie echte Personen.
//
// Kennzeichnung (daran erkennt das Seed-Skript seine eigenen Daten):
//   Benutzer:  Benutzername beginnt mit "demo-"
//   Kunden:    Kundennummer beginnt mit "D-"
//   Projekte:  Projektnummer beginnt mit "D-"
//   Fahrzeuge: Kennzeichen beginnt mit "CLP-DE "

import type { Rolle } from "../src/lib/rollen";

export const SEED_PRAEFIX = {
  benutzer: "demo-",
  kunde: "D-",
  projekt: "D-",
  kennzeichen: "CLP-DE ",
} as const;

export type SeedNutzer = {
  benutzername: string;
  vorname: string;
  nachname: string;
  rolle: Rolle;
  telefon?: string;
  /** true: muss beim ersten Login ein eigenes Passwort setzen (zum Testen). */
  passwortwechsel?: boolean;
};

export const NUTZER: SeedNutzer[] = [
  { benutzername: "demo-admin", vorname: "Heiko", nachname: "Brandt", rolle: "admin" },
  { benutzername: "demo-buero", vorname: "Petra", nachname: "Janssen", rolle: "buero", telefon: "040 66969 100" },
  { benutzername: "demo-sebastian", vorname: "Sebastian", nachname: "Meyer", rolle: "mitarbeiter", telefon: "040 66969 111" },
  { benutzername: "demo-christian", vorname: "Christian", nachname: "Lüken", rolle: "mitarbeiter", telefon: "040 66969 112" },
  { benutzername: "demo-jan", vorname: "Jan", nachname: "Wilken", rolle: "mitarbeiter" },
  { benutzername: "demo-tobias", vorname: "Tobias", nachname: "Hinrichs", rolle: "mitarbeiter" },
  { benutzername: "demo-marco", vorname: "Marco", nachname: "Ahlers", rolle: "mitarbeiter" },
  { benutzername: "demo-dennis", vorname: "Dennis", nachname: "Thoben", rolle: "mitarbeiter" },
  { benutzername: "demo-lukas", vorname: "Lukas", nachname: "Bruns", rolle: "mitarbeiter" },
  { benutzername: "demo-kevin", vorname: "Kevin", nachname: "Möller", rolle: "mitarbeiter", passwortwechsel: true },
];

export const FAHRZEUGE = [
  { name: "Sprinter 1", kennzeichen: "CLP-DE 101" },
  { name: "Sprinter 2", kennzeichen: "CLP-DE 102" },
  { name: "Transporter", kennzeichen: "CLP-DE 201" },
  { name: "Caddy", kennzeichen: "CLP-DE 301" },
];

type Kunde = {
  kundennummer: string;
  typ: "firma" | "privat";
  firmenname?: string;
  anrede?: string;
  vorname?: string;
  nachname?: string;
  ansprechpartner?: string;
  strasse: string;
  plz: string;
  ort: string;
  notizen?: string;
};

export const KUNDEN: Kunde[] = [
  // Firmen
  { kundennummer: "D-1001", typ: "firma", firmenname: "Hausverwaltung Nordwest GmbH", ansprechpartner: "Frau Kruse", strasse: "Lange Straße 21", plz: "26169", ort: "Friesoythe", notizen: "Verwaltet mehrere Objekte in Friesoythe." },
  { kundennummer: "D-1002", typ: "firma", firmenname: "Wohnungsbau Cloppenburg eG", ansprechpartner: "Herr Rolfes", strasse: "Eschstraße 8", plz: "49661", ort: "Cloppenburg" },
  { kundennummer: "D-1003", typ: "firma", firmenname: "Gemeinde Saterland – Bauamt", ansprechpartner: "Herr Tapken", strasse: "Hauptstraße 507", plz: "26683", ort: "Saterland-Ramsloh" },
  { kundennummer: "D-1004", typ: "firma", firmenname: "Zahnarztpraxis Dr. Grote", ansprechpartner: "Frau Dr. Grote", strasse: "Am Markt 4", plz: "26676", ort: "Barßel", notizen: "Arbeiten nur nach Praxisschluss (ab 18 Uhr)." },
  { kundennummer: "D-1005", typ: "firma", firmenname: "Autohaus Feldhaus GmbH & Co. KG", ansprechpartner: "Herr Feldhaus", strasse: "Industriestraße 17", plz: "26169", ort: "Friesoythe" },
  { kundennummer: "D-1006", typ: "firma", firmenname: "Ev.-luth. Kirchengemeinde Strücklingen", ansprechpartner: "Frau Bley", strasse: "Kirchstraße 2", plz: "26683", ort: "Saterland-Strücklingen" },
  { kundennummer: "D-1007", typ: "firma", firmenname: "Bauträger Ems-Hunte GmbH", ansprechpartner: "Herr Deeken", strasse: "Hafenstraße 9", plz: "26871", ort: "Papenburg" },
  { kundennummer: "D-1008", typ: "firma", firmenname: "Bäckerei Stukenborg", ansprechpartner: "Herr Stukenborg", strasse: "Bahnhofstraße 11", plz: "26219", ort: "Bösel" },
  { kundennummer: "D-1009", typ: "firma", firmenname: "Ferienwohnungen am Hollener See", ansprechpartner: "Frau Wreesmann", strasse: "Seestraße 3", plz: "26683", ort: "Saterland-Ramsloh" },
  { kundennummer: "D-1010", typ: "firma", firmenname: "Physiotherapie Hanken", ansprechpartner: "Frau Hanken", strasse: "Lindenallee 6", plz: "49681", ort: "Garrel" },
  // Privat
  { kundennummer: "D-1011", typ: "privat", anrede: "Herr", vorname: "Thomas", nachname: "Gerdes", strasse: "Birkenweg 7", plz: "26683", ort: "Saterland-Scharrel", notizen: "Schlüssel liegt beim Nachbarn (Hausnr. 9)." },
  { kundennummer: "D-1012", typ: "privat", anrede: "Frau", vorname: "Sabine", nachname: "Kramer", strasse: "Moorstraße 23", plz: "26683", ort: "Saterland-Sedelsberg" },
  { kundennummer: "D-1013", typ: "privat", anrede: "Herr", vorname: "Heinz", nachname: "Schulte", strasse: "Am Sportplatz 5", plz: "26169", ort: "Friesoythe" },
  { kundennummer: "D-1014", typ: "privat", anrede: "Frau", vorname: "Anja", nachname: "Behrens", strasse: "Mühlenweg 14", plz: "26676", ort: "Barßel" },
  { kundennummer: "D-1015", typ: "privat", anrede: "Herr", vorname: "Klaus", nachname: "Lammers", strasse: "Dorfstraße 31", plz: "26219", ort: "Bösel" },
  { kundennummer: "D-1016", typ: "privat", anrede: "Frau", vorname: "Maria", nachname: "Pöhlking", strasse: "Wiesenstraße 2", plz: "49681", ort: "Garrel" },
  { kundennummer: "D-1017", typ: "privat", anrede: "Herr", vorname: "Stefan", nachname: "Rüve", strasse: "Kanalstraße 44", plz: "26683", ort: "Saterland-Ramsloh" },
  { kundennummer: "D-1018", typ: "privat", anrede: "Familie", vorname: "Petra und Jörg", nachname: "Wichmann", strasse: "Gartenstraße 9", plz: "26188", ort: "Edewecht" },
  { kundennummer: "D-1019", typ: "privat", anrede: "Herr", vorname: "Gerd", nachname: "Bohlken", strasse: "Heideweg 18", plz: "26655", ort: "Westerstede" },
  { kundennummer: "D-1020", typ: "privat", anrede: "Frau", vorname: "Ursula", nachname: "Tiemann", strasse: "Rosenstraße 3", plz: "26160", ort: "Bad Zwischenahn" },
  { kundennummer: "D-1021", typ: "privat", anrede: "Herr", vorname: "Marc", nachname: "Ostendorf", strasse: "Eichenallee 12", plz: "49661", ort: "Cloppenburg" },
  { kundennummer: "D-1022", typ: "privat", anrede: "Herr", vorname: "Jens", nachname: "Haskamp", strasse: "Ringstraße 27", plz: "26683", ort: "Saterland-Strücklingen" },
  { kundennummer: "D-1023", typ: "privat", anrede: "Frau", vorname: "Monika", nachname: "Albers", strasse: "Lerchenweg 4", plz: "26789", ort: "Leer" },
  { kundennummer: "D-1024", typ: "privat", anrede: "Herr", vorname: "Frank", nachname: "Brockhaus", strasse: "Fehnweg 19", plz: "26676", ort: "Barßel" },
  { kundennummer: "D-1025", typ: "privat", anrede: "Frau", vorname: "Heike", nachname: "Thien", strasse: "Schulstraße 8", plz: "26121", ort: "Oldenburg" },
];

type Projekt = {
  projektnummer: string;
  name: string;
  kunde: string; // Kundennummer
  /** Ohne Angabe: Baustelle = Kundenadresse */
  baustelle?: { strasse: string; plz: string; ort: string };
  status: string; // Name aus project_statuses
  /** Tage relativ zu heute (z. B. -3 = vor 3 Tagen). Ohne Angabe: kein Datum. */
  von?: number;
  bis?: number;
  beschreibung: string;
  mitglieder: string[]; // Benutzernamen
  archiviert?: boolean;
};

/** Einteilung für den Seed-Tag (Kennzeichen → Projektnummer → Benutzernamen). */
export const EINSAETZE_HEUTE: {
  kennzeichen: string;
  projekt: string;
  mitarbeiter: string[];
  notiz?: string;
  /** Weitere Baustellen am selben Tag (Zeit optional: um = muss da sein, ab = kann ab) */
  weitereStopps?: { projekt: string; zeit?: string; zeitArt?: "um" | "ab"; notiz?: string }[];
}[] = [
  { kennzeichen: "CLP-DE 101", projekt: "D-2026-001", mitarbeiter: ["demo-sebastian", "demo-christian"],
    notiz: "Schlüssel liegt beim Nachbarn (Hausnr. 9)." },
  { kennzeichen: "CLP-DE 102", projekt: "D-2026-002", mitarbeiter: ["demo-jan", "demo-tobias", "demo-marco"],
    notiz: "Gerüst ist freigegeben. Farbe RAL 9001 steht im Container." },
  { kennzeichen: "CLP-DE 301", projekt: "D-2026-005", mitarbeiter: ["demo-lukas", "demo-kevin"],
    weitereStopps: [{ projekt: "D-2026-003", zeit: "13:00", zeitArt: "ab", notiz: "Treppenhaus ausmessen" }] },
];

export const PROJEKTE: Projekt[] = [
  { projektnummer: "D-2026-001", name: "Innenanstrich Wohnung Gerdes", kunde: "D-1011", status: "In Arbeit", von: -3, bis: 4,
    beschreibung: "Wände und Decken in 4 Räumen und Flur, weiß matt. Möbel räumt der Kunde aus.", mitglieder: ["demo-sebastian", "demo-christian"] },
  { projektnummer: "D-2026-002", name: "Fassade Ringstraße 14", kunde: "D-1001", status: "In Arbeit", von: -10, bis: 12,
    baustelle: { strasse: "Ringstraße 14", plz: "26169", ort: "Friesoythe" },
    beschreibung: "Fassadenanstrich Mehrfamilienhaus, Gerüst steht. Farbton laut Muster RAL 9001.", mitglieder: ["demo-jan", "demo-tobias", "demo-marco"] },
  { projektnummer: "D-2026-003", name: "Treppenhaus Eschstraße 8", kunde: "D-1002", status: "Auftrag erteilt", von: 7, bis: 14,
    beschreibung: "Treppenhaus über 3 Etagen: Wände streichen, Geländer lackieren.", mitglieder: ["demo-dennis"] },
  { projektnummer: "D-2026-004", name: "Kita-Gruppenräume Ramsloh", kunde: "D-1003", status: "Angebot",
    baustelle: { strasse: "Schulstraße 10", plz: "26683", ort: "Saterland-Ramsloh" },
    beschreibung: "Angebot für 3 Gruppenräume mit emissionsarmer Farbe.", mitglieder: [] },
  { projektnummer: "D-2026-005", name: "Fenster lackieren Kramer", kunde: "D-1012", status: "In Arbeit", von: -1, bis: 2,
    beschreibung: "8 Holzfenster außen schleifen und lackieren.", mitglieder: ["demo-lukas", "demo-kevin"] },
  { projektnummer: "D-2026-006", name: "Praxisräume tapezieren", kunde: "D-1004", status: "Auftrag erteilt", von: 3, bis: 6,
    beschreibung: "Vliestapete in Wartezimmer und 2 Behandlungsräumen, nur nach Praxisschluss.", mitglieder: ["demo-sebastian"] },
  { projektnummer: "D-2026-007", name: "Garagenboden Lammers", kunde: "D-1015", status: "Entwurf",
    beschreibung: "Garagenboden beschichten, ca. 36 m².", mitglieder: [] },
  { projektnummer: "D-2026-008", name: "Ausstellungsraum Autohaus Feldhaus", kunde: "D-1005", status: "Rechnung angelegt", von: -40, bis: -30,
    beschreibung: "Wände und Decke im Ausstellungsraum, Akzentwand in Firmenfarbe.", mitglieder: ["demo-christian", "demo-jan"] },
  { projektnummer: "D-2026-009", name: "Gemeindesaal Strücklingen", kunde: "D-1006", status: "Abgeschlossen", von: -90, bis: -80,
    beschreibung: "Saal und Flur gestrichen, Türen lackiert.", mitglieder: ["demo-tobias", "demo-marco"], archiviert: true },
  { projektnummer: "D-2026-010", name: "Badezimmer Schimmelsanierung", kunde: "D-1014", status: "Rechnung geschrieben", von: -25, bis: -22,
    beschreibung: "Schimmel entfernen, Sanierputz, Anstrich mit Silikatfarbe.", mitglieder: ["demo-dennis"] },
  { projektnummer: "D-2026-011", name: "Holzfassade lasieren", kunde: "D-1018", status: "Anders vergeben",
    beschreibung: "Holzfassade Einfamilienhaus lasieren. Kunde hat anders vergeben.", mitglieder: [] },
  { projektnummer: "D-2026-012", name: "Büroetage Hafenstraße", kunde: "D-1007", status: "Abgelehnt von uns",
    beschreibung: "Zu großer Umfang im gewünschten Zeitraum.", mitglieder: [] },
];
