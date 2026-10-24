# Eigene Rechnungen – Stand 24.10.2026

**Entscheidung (Mika, 24.10.2026):** Paul will nicht extra für Lexware zahlen und nicht von deren Preisen abhängen, nur für das, was Mika selbst gebaut hat. Darum macht die App Rechnungsnummer und Rechnungs-PDF jetzt selbst. Lexware und sevdesk bleiben als abschaltbarer Anschluss im Code (`BUCHHALTUNG_ANBIETER=lexware` oder `sevdesk` plus Zugang), sind aber nicht mehr nötig. Plancraft macht es genauso (Nummern wie `R-(24)22721`).

> **Vor dem echten Einsatz:** Der Steuerberater von Ralf muss bestätigen, dass er Rechnungen aus einer eigenen Software akzeptiert und in welchem Format er die Buchungen braucht. Die App prüft Pflichtangaben, ersetzt aber keine steuerliche Beratung. Die Verantwortung für richtige Rechnungen bleibt beim Betrieb.

## Was fertig ist (erste Stufe)
- **Fertigstellen** (Knopf „Rechnung fertigstellen“ auf der Rechnungsseite, mit Bestätigung, nicht rücknehmbar): Die Datenbank-Funktion `rechnung_finalisieren` vergibt die nächste Nummer **in derselben Transaktion** wie der Status „fertig“. Bricht etwas ab, wird auch die Nummer zurückgenommen, es gibt keine Lücke. Gleichzeitige Aufrufe bekommen verschiedene Nummern (getestet).
- **Nummernformat:** `<Kürzel><Jahr>-<laufende Nummer>`, z. B. `R-2026-0001`. Der Zähler läuft **je Kalenderjahr** (Tabelle `invoice_counters`, nur die Funktion schreibt hinein). Kürzel und Startnummer stehen unter Einstellungen → Nummernkreise (`app_settings` „nummernkreise“: `rechnung_praefix`, `rechnung_start`). Die Startnummer gilt nur für die erste Rechnung eines Jahres, z. B. wenn dieses Jahr schon Rechnungen in Plancraft oder Lexware geschrieben wurden.
- **Regeln der Funktion:** nur eine Rechnung im Entwurf mit mindestens einer Position; Rechnungsdatum nicht in der Zukunft; das Datum darf nicht vor dem der letzten Rechnung desselben Jahres liegen (zeitliche Reihenfolge); nur Büro/Admin mit dem Recht „Ausgangsrechnungen“.
- **Pflichtangaben** (`src/lib/rechnung-eigen.ts`, § 14 UStG): Firmenname, Firmenanschrift, Steuernummer oder USt-IdNr. der Firma (aus Einstellungen → Unternehmen), Anschrift des Kunden. Fehlt etwas, nennt die App es und stellt nicht fertig. Leistungszeitraum, Positionen, Steuersatz/-betrag und Zahlungsziel stehen immer auf der Rechnung.
- **PDF** (`src/lib/rechnung-pdf-daten.ts`, Darstellung in `angebot-pdf.ts` mit dem Zusatz `rechnung`): „Rechnung Nr. …“, Kunde, Rechnungsnr., Datum, Leistungsort, Leistungszeitraum, Projekt, Positionen mit Übertrag, Netto/USt/Brutto, Zahlungsbedingungen mit Fälligkeitsdatum, Fußzeile mit USt-ID, Steuernummer und Bank. Das PDF wird beim Fertigstellen erzeugt und im privaten Bucket `rechnungen` abgelegt; **ein vorhandenes PDF wird nie ersetzt**. Klappt das PDF nicht, bleibt die Rechnung gültig, „PDF neu erzeugen“ holt es nach (nur wenn noch keins da ist).
- **Sperre:** Nach dem Fertigstellen sind Inhalt und Positionen per Datenbank-Trigger gesperrt (wie bei Lexware-Rechnungen). Die Nummer ist eindeutig (Index).
- **Bezahlt** buchen mit Datum und wieder zurücknehmen (nur eigene Rechnungen), Mahnstufe vermerken wie bisher.
- **Tests:** `src/lib/rechnung-eigen.test.ts`, PDF-Test in `angebot-pdf.test.ts`, `tests/rls/25-eigene-rechnungen.test.ts` (10: Nummer, Gleichzeitigkeit, Bedingungen, Jahreswechsel, Rechte, Sperre).

## Was noch fehlt (nächste Stufen)
1. **E-Rechnung** (ZUGFeRD/XRechnung, mit Leitweg-ID für Behörden): Pflicht zum Ausstellen für alle ab 1.1.2028, früher bei über 800.000 € Umsatz. Das PDF wird dann um eingebettete XML-Daten ergänzt und gegen den amtlichen Prüfer getestet.
2. **Storno und Gutschrift** mit eigener Nummer (die Stornorechnung bezieht sich auf die Original-Nummer).
3. **Abschlagsrechnungen** und Schlussrechnung mit Abzug der Abschläge (fachlich mit dem Steuerberater klären).
4. **Rechnung per E-Mail versenden** aus der App (SMTP gibt es schon für Angebote) mit PDF-Anhang.
5. **Mahnwesen** mit Texten und PDF (bisher nur Vermerk der Stufe), **Zahlungseingang** per Bankabgleich.
6. **Export für den Steuerberater** (DATEV-Buchungsstapel oder CSV plus alle PDFs als ZIP).
7. USt-IdNr. des Kunden speichern (bei Reverse-Charge gehört sie auf die Rechnung; die App zeigt einen Hinweis).
8. **Aufbewahrung 8 Jahre** und Backups: Supabase Pro mit täglichen Backups und ein Export der PDFs; kurze Verfahrensbeschreibung für die GoBD.

## Fragen an den Steuerberater
- Akzeptieren Sie Rechnungen aus einer eigenen Software (Format der Nummer `R-2026-0001`, je Jahr neu zählend)?
- In welcher Form brauchen Sie die Ausgangsrechnungen (PDF-Sammlung, DATEV-Export, Lexware-Import)?
- Wie sollen Abschlags-, Schluss-, Storno- und Gutschriftsrechnungen aussehen (Pflichtangaben, Nummernkreis)?
- Reverse-Charge (§ 13b) bei Bauleistungen: Welche Angaben zum Kunden brauchen Sie auf der Rechnung?
- Was muss in der Verfahrensdokumentation (GoBD) stehen, und reicht Supabase Pro mit täglichem Backup plus Export?
- Ab wann brauchen wir die E-Rechnung für Ralfs Betrieb (Vorjahresumsatz), und welches Format will der Steuerberater empfangen?

## Umstellung und Live
- Die Migration `…20261024100000_eigene_rechnungen` liegt bisher nur in **dev**. Vor dem Push des Codes nach **live** muss sie dort eingespielt sein (sonst bricht das Fertigstellen ab).
- Standard ist jetzt „eigen“, **auch online**. Online ist Lexware (`LEXWARE_API_KEY`, `LEXWARE_MODUS=entwurf`) eingetragen. Wer weiter über Lexware arbeiten will, setzt in Vercel `BUCHHALTUNG_ANBIETER=lexware`. Bereits übertragene Lexware-Rechnungen bleiben unverändert bei ihrem Anbieter.
- In live liegt die Zähler-Tabelle erst nach der Migration. Wurde in diesem Jahr schon außerhalb geschrieben, vorher unter Nummernkreise die Startnummer eintragen.
