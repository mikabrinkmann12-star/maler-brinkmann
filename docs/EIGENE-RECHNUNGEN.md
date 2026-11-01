# Eigene Rechnungen – Stand 25.10.2026

> **25.10.2026:** Lexware und sevdesk sind komplett aus der App entfernt (Einstellungsseiten, Übertragung, Abgleich, Clients, Umgebungsvariablen `LEXWARE_*`, `SEVDESK_*`, `BUCHHALTUNG_ANBIETER`). Rechnungen laufen nur noch über die App. Bestehende Rechnungen aus den alten Systemen bleiben als „ältere Rechnung“ lesbar, bezahlbar und mahnbar; stornieren und Gutschrift gibt es nur für Rechnungen der App.

**Entscheidung (Mika, 24.10.2026):** Paul will nicht extra für Lexware zahlen und nicht von deren Preisen abhängen, nur für das, was Mika selbst gebaut hat. Darum macht die App Rechnungsnummer und Rechnungs-PDF jetzt selbst. Lexware und sevdesk bleiben als abschaltbarer Anschluss im Code (`BUCHHALTUNG_ANBIETER=lexware` oder `sevdesk` plus Zugang), sind aber nicht mehr nötig. Plancraft macht es genauso (Nummern wie `R-(24)22721`).

> **Vor dem echten Einsatz:** Der Steuerberater von Ralf muss bestätigen, dass er Rechnungen aus einer eigenen Software akzeptiert und in welchem Format er die Buchungen braucht. Die App prüft Pflichtangaben, ersetzt aber keine steuerliche Beratung. Die Verantwortung für richtige Rechnungen bleibt beim Betrieb.

## Was fertig ist (Stufe 1: Nummer und PDF)
- **Fertigstellen** (Knopf „Rechnung fertigstellen“ auf der Rechnungsseite, mit Bestätigung, nicht rücknehmbar): Die Datenbank-Funktion `rechnung_finalisieren` vergibt die nächste Nummer **in derselben Transaktion** wie der Status „fertig“. Bricht etwas ab, wird auch die Nummer zurückgenommen, es gibt keine Lücke. Gleichzeitige Aufrufe bekommen verschiedene Nummern (getestet).
- **Nummernformat:** `<Kürzel><Jahr>-<laufende Nummer>`, z. B. `R-2026-0001`. Der Zähler läuft **je Kalenderjahr** (Tabelle `invoice_counters`, nur die Funktion schreibt hinein). Kürzel und Startnummer stehen unter Einstellungen → Nummernkreise (`app_settings` „nummernkreise“: `rechnung_praefix`, `rechnung_start`). Die Startnummer gilt nur für die erste Rechnung eines Jahres, z. B. wenn dieses Jahr schon Rechnungen in Plancraft oder Lexware geschrieben wurden.
- **Regeln der Funktion:** nur eine Rechnung im Entwurf mit mindestens einer Position; Rechnungsdatum nicht in der Zukunft; das Datum darf nicht vor dem der letzten Rechnung desselben Jahres liegen (zeitliche Reihenfolge); nur Büro/Admin mit dem Recht „Ausgangsrechnungen“.
- **Pflichtangaben** (`src/lib/rechnung-eigen.ts`, § 14 UStG): Firmenname, Firmenanschrift, Steuernummer oder USt-IdNr. der Firma (aus Einstellungen → Unternehmen), Anschrift des Kunden. Fehlt etwas, nennt die App es und stellt nicht fertig. Leistungszeitraum, Positionen, Steuersatz/-betrag und Zahlungsziel stehen immer auf der Rechnung.
- **PDF** (`src/lib/rechnung-pdf-daten.ts`, Darstellung in `angebot-pdf.ts` mit dem Zusatz `rechnung`): „Rechnung Nr. …“, Kunde, Rechnungsnr., Datum, Leistungsort, Leistungszeitraum, Projekt, Positionen mit Übertrag, Netto/USt/Brutto, Zahlungsbedingungen mit Fälligkeitsdatum, Fußzeile mit USt-ID, Steuernummer und Bank. Das PDF wird beim Fertigstellen erzeugt und im privaten Bucket `rechnungen` abgelegt; **ein vorhandenes PDF wird nie ersetzt**. Klappt das PDF nicht, bleibt die Rechnung gültig, „PDF neu erzeugen“ holt es nach (nur wenn noch keins da ist).
- **Sperre:** Nach dem Fertigstellen sind Inhalt und Positionen per Datenbank-Trigger gesperrt (wie bei Lexware-Rechnungen). Die Nummer ist eindeutig (Index).
- **Bezahlt** buchen mit Datum und wieder zurücknehmen (nur eigene Rechnungen), Mahnstufe vermerken wie bisher.
- **Tests:** `src/lib/rechnung-eigen.test.ts`, PDF-Test in `angebot-pdf.test.ts`, `tests/rls/25-eigene-rechnungen.test.ts` (10: Nummer, Gleichzeitigkeit, Bedingungen, Jahreswechsel, Rechte, Sperre).

## Stufen 2 bis 6 (ebenfalls gebaut, 24.10.2026)
- **Abschlags- und Schlussrechnung** (Angebot → „Abschlagsrechnung“ / „Schlussrechnung“): Abschlag als Prozent oder fester Betrag. Die Schlussrechnung führt alle Leistungen auf und zieht die **fertigen** Abschläge ab (Momentaufnahme in `invoice_abschlaege`); der gespeicherte Betrag ist der Zahlbetrag. Eine Rechnung, die Abschläge übersehen würde, stellt die App nicht fertig. Fachlich vom Steuerberater bestätigen lassen.
- **Gutschrift und Storno** (Rechnungsseite): eigener lückenloser Zähler mit Kürzel `G-` (`gutschrift_praefix`/`gutschrift_start`, einstellbar unter Nummernkreise, Kürzel muss sich vom Rechnungs-Kürzel unterscheiden). Positionen positiv, Summen negativ, Bezug auf die Original-Nummer. Ein Storno setzt das Original auf „storniert“.
- **E-Rechnung** (`src/lib/e-rechnung.ts`): XML nach EN 16931 (CII), XRechnung-Profil mit Leitweg-ID des Kunden, Download als XML oder als PDF mit eingebettetem `factur-x.xml`. **Nicht** mit dem amtlichen Prüfprogramm (KoSIT, braucht Java) geprüft und **kein** zertifiziertes PDF/A-3.
- **Versand per E-Mail** (eigene Rechnungen über das SMTP-Postfach der App) und **Mahnwesen** (Zahlungserinnerung, 1./2. Mahnung mit Gebühr und Verzugszinsen als PDF, `src/lib/mahnung-pdf.ts`).
- **Export für den Steuerberater** (Ausgangsrechnungen → „Export für den Steuerberater“, `/buero/rechnungen/steuerberater`): Zeitraum wählen, dann Rechnungsjournal (CSV für Excel), DATEV-Buchungsstapel (EXTF 510, Windows-1252, Sammeldebitor, Erlöskonten je Steuersatz, Konten unter derselben Seite einstellbar, Einstellung `datev`) und ZIP mit allen Rechnungs-PDFs (bei eigenen Rechnungen mit dem XML), in Teilen zu 15 Rechnungen (Serverlimit). In Lexware/sevdesk stornierte Rechnungen stehen im Journal, werden aber **nicht** in den DATEV-Stapel gebucht (kein Storno-Beleg bei uns).
- **Tests:** `src/lib/steuerberater-export.test.ts`, `e-rechnung.test.ts`, `rechnung-eigen.test.ts`; `tests/rls/26-rechnungsarten.test.ts`, `27-e-rechnung.test.ts`. Im Browser geprüft (dev): Abschlag 30 % anlegen und fertigstellen, Storno, Export-Seite mit Journal, DATEV und ZIP.

## Was noch fehlt
1. **E-Rechnung** gegen den amtlichen Prüfer testen (Pflicht zum Ausstellen für alle ab 1.1.2028).
2. **DATEV-Stapel** ist nicht mit DATEV getestet; Berater-/Mandantennummer und Konten nennt der Steuerberater. Kein Konto je Kunde (Sammeldebitor), keine Zahlungsbuchungen.
3. **Zahlungseingang** per Bankabgleich (bisher von Hand „als bezahlt buchen“).
4. USt-IdNr. des Kunden speichern (bei Reverse-Charge gehört sie auf die Rechnung; die App zeigt einen Hinweis).
5. **Aufbewahrung 8 Jahre** und Backups: Supabase Pro mit täglichen Backups und ein Export der PDFs; kurze Verfahrensbeschreibung für die GoBD.

## Fragen an den Steuerberater
- Akzeptieren Sie Rechnungen aus einer eigenen Software (Format der Nummer `R-2026-0001`, je Jahr neu zählend)?
- In welcher Form brauchen Sie die Ausgangsrechnungen (PDF-Sammlung, DATEV-Export, Lexware-Import)?
- Wie sollen Abschlags-, Schluss-, Storno- und Gutschriftsrechnungen aussehen (Pflichtangaben, Nummernkreis)?
- Reverse-Charge (§ 13b) bei Bauleistungen: Welche Angaben zum Kunden brauchen Sie auf der Rechnung?
- Was muss in der Verfahrensdokumentation (GoBD) stehen, und reicht Supabase Pro mit täglichem Backup plus Export?
- Ab wann brauchen wir die E-Rechnung für Ralfs Betrieb (Vorjahresumsatz), und welches Format will der Steuerberater empfangen?

## Umstellung und Live
- Die Migrationen `…20261024100000_eigene_rechnungen` und `…20261024110000_rechnungsarten` liegen bisher nur in **dev**. Vor dem Push des Codes nach **live** muss sie dort eingespielt sein (sonst bricht das Fertigstellen ab).
- Es gibt nur noch „eigen“, auch online. Die alten Variablen (`LEXWARE_API_KEY`, `LEXWARE_MODUS`, `SEVDESK_API_TOKEN`, `SEVDESK_MODUS`, `BUCHHALTUNG_ANBIETER`) in Vercel und `.env.local` werden nicht mehr gelesen und können gelöscht werden (`npx vercel@latest env rm NAME production`).
- In live liegt die Zähler-Tabelle erst nach der Migration. Wurde in diesem Jahr schon außerhalb geschrieben, vorher unter Nummernkreise die Startnummer eintragen.
