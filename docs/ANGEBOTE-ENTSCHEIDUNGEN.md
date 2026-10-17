# Angebote (Phase 4): Entscheidungen der Nacht vom 17. auf den 18.10.2026

Mika hat mir erlaubt, in dieser Nacht offene Fragen selbst zu entscheiden (immer die empfohlene Variante), so nah wie
möglich an Plancraft zu bleiben und das Ganze nach Möglichkeit einstellbar zu machen. Das Design (Farben, Emojis) kommt zuletzt.
Diese Liste hält fest, was entschieden wurde und was noch fehlt.

## Von Mika vorher entschieden
- Ein Angebot hängt **immer an einem Projekt**.
- **Keine eigene Angebotsnummer**, wie im Plancraft-Angebot (im Kopf: Kundennummer, Projektnummer, Datum).
- Umsatzsteuer **vom Kunden vorbelegt** (Steuersatz im Kontakt), im Angebot änderbar; bei 0 % und Reverse-Charge erscheint der Hinweis nach § 13b UStG.
- Positionsnummern **1., 2., 3.** wie in Plancraft.
- Rabatt: Gesamtrabatt in % auf die Netto-Summe. Katalogpreis wird kopiert und ist im Angebot änderbar.
- Alles direkt in dev **und live** (es sind noch keine Mitarbeiter in der Live-Version).
- Zusatzwunsch: **Arbeitsanweisung** aus dem Angebot (Stichpunkte, nur Arbeit und Mengen, **keine Preise**). Mitarbeiter dürfen Projekte nicht bearbeiten oder archivieren, ihre Zeiten aber direkt aus dem Projekt eintragen und die Notizen sehen (das gab es schon, ist jetzt per Test belegt).

## Von mir entschieden (jeweils die empfohlene Variante)

### Einstellungen
1. **Firmendaten** stehen unter *Einstellungen → Firmendaten* (Name, Inhaber, Anschrift, Telefon, E-Mail, USt-ID, Steuernummer, Bank, IBAN, BIC). Als Startwert habe ich sie aus deinem Plancraft-Angebot per Migration eingetragen (nur wenn noch nichts gespeichert war). Bitte kurz prüfen, die Webseite ist leer.
2. **Angebote – Vorgaben** (*Einstellungen*): Anfangstext, Schlusstext, Reverse-Charge-Hinweis, Standard-Umsatzsteuer, Standard-Rabatt. Sie werden in jedes **neue** Angebot kopiert; bestehende Angebote ändern sich nie. Texte stammen aus dem Plancraft-Angebot.

### Angebot anlegen
3. Neues Angebot braucht nur Projekt und Betreff. Leistungsort = Baustellen-Adresse des Projekts, Empfänger = Briefanschrift des Kunden (als Kopie, im Angebot änderbar), Datum = heute.
4. **Steuer:** Steuersatz des Kunden wird übernommen. **0 % beim Kunden bedeutet Reverse-Charge** (so wie bei Paul Rolfes Bauunternehmen). Im Angebot gibt es vier Auswahlpunkte: 19 %, 7 %, 0 % ohne Hinweis, Reverse-Charge.

### Editor
5. Bausteine: **Position, Titel, Text, Zwischensumme, Bild**. Mit Titeln werden die Positionen 1., 1.1, 1.2, 2., 2.1 … nummeriert; Positionen vor dem ersten Titel bilden eine eigene Gruppe.
6. Menge mit bis zu 3 Nachkommastellen, Preis mit 2. **Negative Werte sind erlaubt** (Abzüge). Eingabe mit deutschem Komma.
7. **Rundung:** Jede Position wird auf den Cent gerundet (0,5 Cent rundet auf), danach Rabatt und Umsatzsteuer auf den Cent. Gerechnet wird in ganzen Cent.
8. **Katalog:** „Aus Katalog“ sucht in Leistungen oder Materialien (Bezeichnung, Nummer, Beschreibung), 25 Treffer. Übernommen werden Text, Einheit und Verkaufspreis, **Menge 1**, beides danach änderbar. Es gibt noch kein Blättern durch die Ordner.
9. **Einfügen:** Neue Bausteine kommen ans Ende oder über „hier einfügen“ hinter einen bestehenden. Sortieren mit Pfeilen (kein Ziehen).
10. **Bilder:** Im Browser auf 1920 px verkleinert (JPEG), Speicher nur für Büro und Admin. Pro Bild eine optionale Unterschrift.
11. **Status:** Entwurf → Versendet → Angenommen / Abgelehnt. **Ab „Versendet“ ist das Angebot gesperrt** (auch in der Datenbank). Mit „Zurück auf Entwurf“ wird es wieder bearbeitbar. „Versendet“ geht nur mit mindestens einer Position. **Der Projektstatus ändert sich nicht automatisch** (z. B. „Auftrag erteilt“ bei Angenommen), das bleibt von Hand.
12. **Kopieren:** Neues Angebot als Entwurf im selben Projekt, Datum heute, alle Bausteine und Bilder werden mitkopiert.
13. Nichts wird gelöscht: Angebote werden archiviert; einzelne Bausteine dürfen im Entwurf gelöscht werden.

### PDF
14. Aufbau wie Plancraft: Absenderzeile, Empfänger, Firmenblock rechts, Titel, Kunde/Projekt/Datum, Betreff, Leistungsort, Anfangstext, Tabelle (Pos., Menge, Einheit, Beschreibung, Preis, Gesamt), **„Übertrag“ oben auf Folgeseiten**, Summen, Schlusstext, Unterschriftsfeld, Fußzeile mit Inhaber, USt-ID, Steuernummer, Bank und „Seite x von y“.
15. Titel „Angebot – Entwurf“ nur im Status Entwurf, sonst „Angebot“. Der Kurztext ist **nur fett, wenn es auch einen Langtext gibt** (in Plancraft stand der Text normal).
16. „Mit dem Angebot bin ich einverstanden.“ mit Unterschriftslinie steht immer am Ende (noch nicht einstellbar).
17. Schrift: eingebaute Helvetica, **noch kein Logo und kein Briefpapier**. Kommt mit dem Design.
18. **Kein E-Mail-Versand.** Das PDF wird heruntergeladen und von Hand verschickt. Dafür braucht es erst einen E-Mail-Dienst und einen Zugang.

### Arbeitsanweisung
19. **Regelbasiert, ohne KI** (kostet nichts). Aus jeder Position wird ein Stichpunkt „Text – Menge Einheit“, Sätze aus dem Langtext werden Unterpunkte, Titel werden Überschriften, Text-Bausteine werden zu „Hinweis: …“. **Preise, Zwischensummen und Bilder fehlen.** Pauschalen heißen „pauschal“, Positionen mit Menge 0 oder weniger (Abzüge) werden weggelassen. Eine KI kann später dieselbe Aufgabe übernehmen (Schnittstelle: `arbeitsanweisungErzeugen`).
20. Die Arbeitsanweisung ist eine **eigene Tabelle** (Mitarbeiter dürfen Angebote nicht sehen). **Das Büro prüft und gibt sie frei**, vorher sehen sie die Mitarbeiter nicht. Der Text ist vor der Freigabe änderbar. Pro Angebot gibt es eine aktive Arbeitsanweisung. Neu erzeugen geht nur, solange sie nicht freigegeben ist.
21. Zu sehen ist sie auf der Projektseite („Arbeitsanweisung“), für Mitarbeiter nur bei Projekten, auf denen sie eingetragen sind.

### Datenbank
22. Drei neue Migrationen (`…18080000_angebote`, `…18090000_firmendaten_vorgabe`, `…18100000_arbeitsanweisung`) liegen in dev **und live**.

## Noch nicht gebaut / offen
- E-Mail-Versand, Logo und Briefpapier, Design.
- Menge aus dem **Aufmaß** übernehmen.
- Mehrere Textvorlagen für Anfangs-/Schlusstext, Zahlungsziel und Skonto im PDF, „gültig bis“.
- Alternativ- und Optionalpositionen, Positionen mit Material und Lohn getrennt.
- Katalog beim Angebot als Ordner-Baum durchblättern.
- „Mitarbeiter-Schnellzugriff“ auf die Arbeitsanweisung (Knopf neben Zeit/Fotos/Notizen).
- Die **KI-Variante** der Arbeitsanweisung und des Angebots (erst nach Ralfs Entscheidung wegen der Kosten).
- Angebot → Auftrag → Rechnung (Phase 5, Lexware).

## Nachträge am 18.10.2026 (Mika wieder da)
- **KI-Assistent als Platzhalter** (Mika: „soll drin stehen, aber noch nicht funktionieren, damit man zeigen kann, dass es das gibt“): Im Angebot gibt es einen Kasten „KI-Assistent – Vorschau: noch nicht aktiv“. Man kann schon eine Beschreibung eintippen, der Knopf „Positionen vorschlagen“ erklärt aber nur, dass die KI noch nicht angeschlossen ist. Es wird nichts gespeichert oder an einen Dienst geschickt. Schnittstelle: `src/lib/ki.ts` (`kiAnbieter()`), Aktion `src/app/buero/angebote/ki-actions.ts`. Später ersetzt ein echter Anbieter nur `kiAnbieter()`.
- **Logo:** *Einstellungen → Firmendaten → Logo* (PNG/JPEG bis 2 MB, nur Admin). Erscheint oben links im PDF. Bucket `firmenlogo` (Migration `…18110000`, dev und live). Briefpapier (Hintergrund) ist damit noch nicht gebaut.
- **Rechnungen (Wunsch von Mika):** In der App erstellen, an Lexware Office schicken, die fertige Rechnung (mit Lexware-Nummer und PDF) zurück in die App holen und dort als Spiegel behalten. Das passt zur harten Regel (Nummer und PDF kommen von Lexware, die App erzeugt sie nie selbst). Erkenntnisse aus der Lexware-Doku und offene Fragen stehen im Gespräch/in CLAUDE.md (Phase 5).
- **E-Mail-Versand:** Mika wählte „vorhandenes Postfach per SMTP“. Gebaut mit Zwei-Schritt-Bestätigung, Vorlage in den Einstellungen und Rücksetzen auf „Entwurf“, wenn der Versand fehlschlägt. Fehlt noch: die echten SMTP-Zugangsdaten in Vercel (und `.env.local`). Ein Entwurf wird beim Senden automatisch „Versendet“ (und damit gesperrt).
- **Rechnungen und E-Rechnung:** Siehe CLAUDE.md, Phase 5 (Ablauf, Sicherheit der Übertragung, E-Rechnungspflicht, was beim ersten echten Test zu prüfen ist). Mika entschied: gleich finalisieren, Leistungszeitraum von–bis, nur normale Rechnung/Schlussrechnung.
