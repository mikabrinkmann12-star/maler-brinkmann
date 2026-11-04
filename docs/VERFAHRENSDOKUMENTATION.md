# Verfahrensdokumentation Rechnungen (Entwurf, Stand 04.11.2026)

Entwurf als Gesprächsgrundlage für den Steuerberater. Er sagt, was fehlt oder falsch ist. Keine steuerliche Beratung, nicht freigegeben.

## 1. Zweck und Umfang
Die Software „Maler Brinkmann“ erstellt Angebote und Ausgangsrechnungen (Rechnungen, Abschläge, Schlussrechnungen, Gutschriften, Stornos) für den Maler Betrieb Ralf Brinkmann. Sie bucht nicht; für die Buchhaltung gibt es einen Export (Rechnungsliste CSV, DATEV-Buchungsstapel als Vorschlag, alle PDFs).

## 2. Rechnung erstellen
- Entwurf entsteht aus einem Angebot (Positionen, Steuer, Rabatt, Kunde) und ist bis zum Fertigstellen änderbar.
- Beim „Fertigstellen“ prüft die Software Pflichtangaben (§ 14 UStG: Firmenname und -anschrift, Steuernummer oder USt-IdNr., Kundenanschrift, Leistungszeitraum, Steuersatz/-betrag, Zahlungsziel).
- Die Datenbank vergibt die Rechnungsnummer in derselben Transaktion: lückenlos, je Kalenderjahr neu (`R-JJJJ-NNNN`, Gutschrift/Storno eigener Zähler `G-JJJJ-NNNN`). Das Rechnungsdatum darf nicht in der Zukunft und nicht vor dem der vorigen Rechnung liegen.
- Danach wird das PDF erzeugt und unveränderlich gespeichert (privater Speicher, wird nie überschrieben). Bei Rechnungen der App entsteht auf Abruf eine E-Rechnung (XML nach EN 16931, ZUGFeRD/XRechnung; noch nicht amtlich geprüft).

## 3. Unveränderbarkeit
- Nach dem Fertigstellen sperrt ein Datenbank-Trigger Inhalt und Positionen. Nur Zahlungsstatus, Mahnstufe und Notiz bleiben änderbar.
- Korrekturen nur per Storno (Kopie mit negativen Summen, eigene Nummer, Bezug zum Original) oder Gutschrift.
- Fertige Rechnungen werden nicht gelöscht; Entwürfe lassen sich archivieren.

## 4. Nachvollziehbarkeit
- Änderungsprotokoll (`audit_log`) für wichtige Tabellen: wer hat was wann geändert.
- Versand und Mahnungen werden mit Empfänger und Zeitpunkt vermerkt.
- Zahlungseingang wird von Hand mit Datum gebucht (kein Bankabgleich).

## 5. Zugriff
- Rollen: Admin, Büro, Mitarbeiter. Rechnungen sehen und bearbeiten nur Büro und Admin (Rechte einstellbar). Durchgesetzt in der Datenbank (Row Level Security) und im Server.
- Anmeldung mit Benutzername und Passwort; Startpasswort muss beim ersten Login geändert werden; Zugänge lassen sich sperren.

## 6. Datensicherung und Aufbewahrung (Lücken!)
- Daten liegen bei Supabase (Frankfurt) und die Anwendung bei Vercel.
- **Aktuell (Testphase, kostenlose Tarife): keine täglichen Backups.** Vor dem echten Einsatz: Supabase Pro mit täglicher Sicherung (kostenpflichtig) plus regelmäßiger Export aller Rechnungs-PDFs.
- **Aufbewahrung 8 Jahre** ist technisch nicht erzwungen (nichts wird gelöscht, aber es gibt keine Archivierung außerhalb der Datenbank). Offen: Exportablauf und Ort.
- Wiederherstellungsanleitung fehlt noch.

## 7. Offene Punkte
- Bestätigung des Steuerberaters zum Verfahren und zum Nummernformat.
- E-Rechnung amtlich prüfen; DATEV-Datei mit echten Beraternummern testen.
- Backups, Export und Wiederherstellung festlegen.
- Kunden-USt-IdNr. für Reverse-Charge (§ 13b) bei Bedarf ergänzen.
- AVV mit Supabase und Vercel abschließen.
