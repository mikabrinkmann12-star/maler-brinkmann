# Schnittstelle (API) für Jarvis und andere Programme

Stand 20.10.2026, Version 1. Gebaut, damit ein Sprachassistent („Jarvis“) die App wie eine Sekretärin bedienen kann.

## Grundsätze
- **Schlüssel statt Passwort.** Der Admin legt unter *Einstellungen → Schnittstelle (API)* einen Schlüssel an (Name + Rechte). Der Schlüssel (`mbk_…`, 52 Zeichen) wird **einmal** angezeigt; gespeichert wird nur sein Hash. Widerruf jederzeit, danach geht er sofort nicht mehr.
- **Rechte:** `lesen` und/oder `schreiben` (ausdrücklich vergeben, `schreiben` schließt `lesen` nicht ein).
- **In wessen Namen?** Neue Einträge stehen im Namen des Admins, der den Schlüssel angelegt hat. Der Schlüssel gilt nur, solange dieser Admin aktiv ist.
- **Bewusst nicht möglich:** Angebote versenden, E-Mails schicken, Rechnungen an die Buchhaltung übertragen oder finalisieren, Löschen, Nutzer/Einstellungen ändern, Angebotsstatus „versendet“ setzen. Jarvis darf Rechnungen **schreiben (Entwurf)**, nicht abschicken.
- **Sicherheit:** höchstens 120 Anfragen pro Minute und Schlüssel, jeder Aufruf steht im Protokoll (`api_log`, sichtbar auf der Schnittstellen-Seite), feste Endpunkte mit festen Spalten (kein freier Datenbankzugriff). HTTPS (Vercel).

## Aufruf
Basis: `https://maler-brinkmann-23nr.vercel.app/api/v1` (lokal `http://localhost:3000/api/v1`).
Kopfzeile: `Authorization: Bearer mbk_…` (oder `X-API-Key: mbk_…`). Antworten sind JSON:
`{ "daten": … }` bei Erfolg (GET 200, POST 201), `{ "fehler": "verständlicher deutscher Text" }` sonst. Statuscodes: 400 ungültige Eingabe, 401 Schlüssel fehlt/ungültig/widerrufen, 403 Recht fehlt oder Ersteller nicht mehr Admin, 404 nicht gefunden, 405 falsche Methode, 409 Regel verletzt (z. B. Container gesperrt, Zeit überschneidet sich, Angebot gesperrt), 413 zu groß, 429 zu viele Anfragen.

`GET /api/v1` liefert den **Katalog aller Endpunkte** (Methode, Pfad, Recht, Beschreibung, Parameter, Körper) – daraus kann Jarvis seine Werkzeuge ableiten.

Beispiel:
```
curl -H "Authorization: Bearer mbk_…" "https://maler-brinkmann-23nr.vercel.app/api/v1/projekte?q=Gerdes"
curl -X POST -H "Authorization: Bearer mbk_…" -H "Content-Type: application/json" \
  -d '{"art":"papier"}' https://maler-brinkmann-23nr.vercel.app/api/v1/container
```

## Lesen (Recht `lesen`)
| Endpunkt | Zweck |
|---|---|
| `GET uebersicht` | Kennzahlen (offene Angebote, Entwürfe, Eingangsrechnungen zu prüfen, Urlaubsanträge, Container, Projekte nach Status) |
| `GET projekte?q=&archiv=1&limit=` | Projekte suchen |
| `GET projekte/:id` | Projekt mit Kunde, Team, Angeboten, Rechnungen |
| `GET kontakte?q=` | Kontakte suchen |
| `GET mitarbeiter` | aktive Mitarbeiter |
| `GET zeiten?person=&projekt=&von=&bis=` | Zeiteinträge (Standard: aktueller Monat) |
| `GET einteilung?datum=` | Einteilung eines Tages (Autos, Baustellen, Mitarbeiter) |
| `GET angebote?projekt=&status=` | Angebote |
| `GET rechnungen?projekt=` | Ausgangsrechnungen |
| `GET eingangsrechnungen?zahlstatus=&zu_pruefen=1` | Eingangsrechnungen |
| `GET urlaub?status=` | Urlaubs- und Abfeier-Anträge |
| `GET container` | Container-Meldungen und Sperre je Art |
| `GET katalog?q=&art=leistung\|material` | Leistungen/Materialien mit Verkaufspreis |
| `GET termine?von=&bis=` | Termine |

## Schreiben (Recht `schreiben`)
| Endpunkt | Körper | Zweck |
|---|---|---|
| `POST container` | `{ "art": "papier"\|"restmuell" }` | Container melden (danach 7 Tage gesperrt, sonst 409) |
| `POST container/:id/erledigt` | `{ "notiz" }` | Meldung als erledigt markieren (z. B. „bestellt bei Firma X“) |
| `POST zeiten` | `{ "person_id", "datum", "art", "projekt_id", "von", "bis", "pause_min" }` oder `{ …, "stunden" }` | Zeit eintragen (Überschneidung → 409) |
| `POST notizen` | `{ "projekt_id", "text" }` | Projektnotiz |
| `POST kontakte` | `{ "typ", "firmenname"/"vorname"+"nachname", "strasse", "plz", "ort", "telefon", "email" }` | Kontakt (Kundennummer vergibt die App) |
| `POST projekte` | `{ "name", "kunde_id", "strasse", "plz", "ort", "beschreibung", "start", "ende" }` | Projekt (Projektnummer vergibt die App) |
| `POST angebote` | `{ "projekt_id", "betreff", "positionen": [ { "kurztext", "langtext", "menge", "einheit", "einzelpreis" } ] }` | Angebot als **Entwurf** (Kunde, Adresse, Steuer, Texte vorbelegt) |
| `POST angebote/:id/positionen` | `{ "positionen": [ … ] }` | Positionen an einen Entwurf anhängen |
| `POST angebote/:id/status` | `{ "status": "angenommen"\|"abgelehnt"\|"entwurf" }` | Status (nie „versendet“) |
| `POST rechnungen` | `{ "angebot_id" }` | **Rechnungsentwurf** aus einem versendeten/angenommenen Angebot (nicht übertragen, nicht verschickt) |

## Jarvis
Gedacht: Ein Sprachassistent (Telefon/Handy) ruft diese Endpunkte als Werkzeuge auf („Neues Projekt für Gerdes“, „Wer ist morgen auf welcher Baustelle?“, „Schreib die Rechnung zum Angebot …“, „Bestell einen Papiercontainer“). Der Telefon-Teil (Anruf bei der Containerfirma, Anrufe annehmen) braucht bezahlte Dienste (KI-Schlüssel, Telefonnummer) und wird erst nach Ralfs Entscheidung gebaut. Wer nach dem Anruf „Container bestellt“ meldet, ruft `POST container/:id/erledigt` auf.

Code: `src/app/api/v1/[[...pfad]]/route.ts` (Einstieg), `src/lib/api/` (Anmeldung, Router, Lesen, Schreiben), `src/lib/api-schluessel.ts` (Schlüssel), Tests `tests/rls/18-api.test.ts` (14) und `src/lib/api*/*.test.ts`.
