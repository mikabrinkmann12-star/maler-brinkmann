-- Ausgangsrechnung wie Plancraft (Mika, 20.10.2026): Abschnitt „Notiz“ an der Rechnung (interne Bemerkung, nicht auf dem PDF).
-- Die Sperre übertragener Rechnungen betrifft diese Spalte nicht, die Notiz bleibt immer änderbar.
alter table public.invoices add column notiz text check (length(notiz) <= 2000);
