# Anrufe (KI-Telefon) – Stand 22.10.2026

Wie bei Plancraft („Anrufe“): Eine KI nimmt Anrufe an, schreibt auf, worum es ging, und die App zeigt die Anrufe mit Zusammenfassung, Kategorie (Anfrage, Information, Spam, Sonstiges) und Status (Neu, In Bearbeitung, Erledigt). **Das hat nichts mit Jarvis zu tun.**

## Was fertig ist (App-Seite, kostenlos)
- Büro-Menü **Anrufe** (`/buero/anrufe`): Liste mit Reitern nach Status, Archiv, Zusammenfassung, Gesprächstext zum Aufklappen, Status/Kategorie ändern, Notiz, „Anruf eintragen“ (von Hand, z. B. verpasster Anruf). Der Anrufer wird über die Rufnummer mit einem Kontakt verknüpft (nur bei genau einem Treffer).
- Neuer eingehender Anruf (kein Spam) gibt einen **Hinweis** (Glocke und Übersicht).
- Webhook `POST /api/anrufe`: Der Telefon-Dienst schickt nach jedem Anruf das Ergebnis. Ein zweites Senden desselben Anrufs legt nichts doppelt an.
- Rechte: Büro/Admin mit dem Recht „Hinweise (Glocke) und Verlauf im Büro sehen“ (`buero_zugang`), Mitarbeiter nie. Nichts wird gelöscht (archivieren). Tabelle `calls` (Migrationen `…20261022100000_anrufe` und `…20261022110000_anrufe_verweise`).

## Was noch fehlt: das echte Telefon (kostet Geld, Ralf entscheidet)
Dafür braucht es einen Telefon-KI-Dienst mit Rufnummer. Richtwerte aus Vergleichsseiten (Herstellerangaben, nicht geprüft, Preise ändern sich):
- Retell: etwa 0,07 bis 0,31 US-$ pro Minute plus Nummer (ab etwa 2 US-$ im Monat), Rechenzentren in den USA ([Preisübersicht](https://www.retellai.com/de/blog/how-much-should-you-spend-on-an-ai-voice-agent), [Zeeg-Vergleich](https://zeeg.me/en/blog/post/retell-ai-pricing-guide)).
- Deutsche Anbieter wie Fonio, Zeeg, Famulor, sipgate: etwa 0,08 bis 0,18 € pro Minute, Hosting in Deutschland ([Vergleich](https://www.famulor.io/de/blog/voice-ai-vergleich-2026-teloro-retell-vapi-kmu-deutschland)).
- Bei wenigen Anrufen am Tag sind das grob einige Euro bis wenige Dutzend Euro im Monat.
- **Datenschutz vor dem Start klären:** Anrufer müssen am Anfang erfahren, dass eine KI das Gespräch aufnimmt/auswertet; Vertrag zur Auftragsverarbeitung mit dem Anbieter; bei US-Anbietern die Datenübermittlung prüfen. Das mit Ralf bzw. Datenschutzberatung besprechen.
- Ein Konto beim Anbieter, die Zahlungsdaten und die Telefonnummer richtet **Mika/Ralf selbst** ein. Dabei hilft keine Automatik.

## Einrichten, sobald ein Dienst gewählt ist
1. In Vercel (Production) die Variable `ANRUFE_WEBHOOK_SECRET` setzen (langer Zufallstext, z. B. `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). Nicht im Dashboard „affect multiple environments“ benutzen (siehe CLAUDE.md), gezielt nur Production.
2. Beide Migrationen nach **live** einspielen (`npx supabase link --project-ref tezveryzixrysviapmal`, `db push`, danach wieder mit dev verknüpfen). **Vor** dem Push des Codes, sonst bricht die Anrufe-Seite live ab.
3. Im Dienst als Webhook-Adresse `https://maler-brinkmann-23nr.vercel.app/api/anrufe` eintragen und das Geheimnis mitschicken: im Kopf `Authorization: Bearer <Geheimnis>` oder `x-webhook-secret: <Geheimnis>`, notfalls als `?key=<Geheimnis>` an der Adresse.
4. Erst mit einem Probeanruf prüfen (nur ein Anruf, Ergebnis in der Liste ansehen).

## Format, das die App versteht (`src/lib/anruf.ts`)
Generisch (für jeden Dienst, der frei konfigurierbar ist, z. B. über Zapier/Make oder eigenes Skript):
```json
{ "id": "eindeutige-anruf-id", "von": "+49 4492 123456", "an": "+49 4492 708108", "richtung": "eingehend",
  "beginn": "2026-10-22T08:30:00Z", "dauer_sek": 142,
  "zusammenfassung": "Frau Meyer möchte ein Angebot …", "kategorie": "anfrage", "transkript": "…" }
```
`id` und `zusammenfassung` oder `transkript` sind Pflicht. Fehlt `kategorie`, rät die App nach Stichwörtern (Spam, Anfrage, Information, sonst Sonstiges).

Retell: Das Ereignis `call_analyzed` wird erkannt (Anruf-ID, Nummern, Zeiten, Zusammenfassung, Gesprächstext). **Diese Form ist nach der Dokumentation aus dem Gedächtnis gebaut und mit keinem echten Anruf geprüft.** Retell signiert seine Aufrufe zusätzlich mit einem eigenen Kopf, das prüft die App nicht (nur das Geheimnis).

## Probieren ohne Dienst (nur dev)
- `npm run anruf:demo` legt vier Demo-Anrufe in `brinkmann-dev` an (über die laufende App unter localhost:3000, mit dem Geheimnis aus `.env.local`). `npm run anruf:demo -- --weg` entfernt sie wieder.
- Tests: `src/lib/anruf.test.ts` (Umwandlung, Kategorie, Nummern) und `tests/rls/24-anrufe.test.ts` (Rechte, Webhook).

## Nicht gebaut
Rückruf-/Termin-Knopf direkt aus dem Anruf, Anruf-Aufnahme abspielen (nur Text), Anrufe einem Projekt zuordnen, Kachel auf der Übersicht (nur der Hinweis), ausgehende KI-Anrufe, eigene Ansage/Prompt der KI (das stellt man im Dienst ein).
