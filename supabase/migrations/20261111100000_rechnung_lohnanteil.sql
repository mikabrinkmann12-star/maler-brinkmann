-- Lohnanteil je Rechnungsposition (Lohnkosten nach § 35a EStG für Privatkunden, wie in Plancraft „Lohnkostenanteil ausweisen“).
-- lohn_einzel = Lohnanteil am Einzelpreis (netto, € je Einheit). null = unbekannt (freie Position ohne Kalkulation).
-- Die Sperre nach dem Fertigstellen (Trigger auf invoice_items) gilt auch für diese Spalte.

alter table public.invoice_items
  add column lohn_einzel numeric(14, 4)
  check (lohn_einzel is null or (lohn_einzel >= 0 and (einzelpreis is null or lohn_einzel <= einzelpreis)));

comment on column public.invoice_items.lohn_einzel is 'Lohnanteil am Einzelpreis (netto, € je Einheit) für den Ausweis der Lohnkosten nach § 35a EStG; null = unbekannt';
