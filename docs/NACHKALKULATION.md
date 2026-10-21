# Nachkalkulation (gebaut 21.10.2026)

Seite: `/buero/projekte/[id]/nachkalkulation` (Kachel „Nachkalkulation“ auf der Projektseite). Nur Büro/Admin (Recht „Projekte ansehen“, Erfassen mit „Projekte bearbeiten“).

## Was sie zeigt
- **Arbeitsstunden** Ist gegen Soll mit Prozentring (über 100 % rot), **Erlös** laut Angebot (netto), **Kosten** Ist gegen Soll, **Ertrag** (Erlös minus Ist-Kosten, in % und „geplant“).
- Tabelle je **Kostenart** (Lohn, Material, Geräte, Fremdleistung, Sonstiges): Soll, Ist, Abweichung, Ist vom Soll.
- **Kosten erfassen**: Datum, Kostenart, Betrag netto, Beschreibung (Entfernen = archivieren). Dazu die dem Projekt zugewiesenen Eingangsrechnungen, deren Kostenart man hier wählt.

## Regeln (Annahmen, mit Mika/Ralf abzustimmen)
1. **Soll** kommt aus dem Angebot des Projekts: angenommen vor versendet vor Entwurf, jeweils das neueste, nicht archiviert, nicht abgelehnt. Soll-Stunden und Soll-Kosten gibt es nur für Positionen, die aus einer **kalkulierten Leistung** stammen (Katalog → Leistung → „Preis kalkulieren“, `services.kalkulation`). Andere Positionen zählen nur zum Erlös.
2. **Ist-Lohn** = alle Stunden der Arten Arbeitszeit, Fahrtzeit, Schlechtwetter, Sonstiges auf dem Projekt mal **Lohnkosten der ersten Lohngruppe** (24,88 €/h). Die Lohngruppe je Mitarbeiter gibt es noch nicht. Urlaub, Krank usw. haben kein Projekt und zählen nicht.
3. **Ist-Material/Geräte/Fremdleistung/Sonstiges** = erfasste Kosten plus zugewiesene Eingangsrechnungen (netto). Eine Eingangsrechnung zählt als **Material**, bis man hier eine andere Kostenart wählt.
4. Alle Beträge **netto**. Der Erlös ist die Nettosumme des Angebots nach Rabatt.

## Technik
- Migration `…20261021150000_nachkalkulation`: Tabelle `project_costs` (RLS Büro/Admin, restriktive Rechte-Regeln, kein DELETE, Audit) und `incoming_invoices.kostenart`.
- Logik `src/lib/nachkalkulation.ts` (getestet), Laden `src/lib/nachkalkulation-daten.ts`, Aktionen `…/nachkalkulation/actions.ts`, Tests `tests/rls/22-nachkalkulation.test.ts`.

## Nicht gebaut
Lohngruppe je Mitarbeiter, Kosten aus dem Material-Katalog, Soll je Position, Verlauf über die Zeit, Export.
