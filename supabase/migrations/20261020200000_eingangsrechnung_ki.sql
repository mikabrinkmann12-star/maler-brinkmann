-- KI-Auslesen von Eingangsrechnungen (Mika, 20.10.2026): neuer Wert „ki“ für die Herkunft der gelesenen Felder.
-- Das KI-Auslesen ist standardmäßig AUS (Umgebungsvariable KI_RECHNUNG_AKTIV); der Wert wird erst geschrieben, wenn es eingeschaltet ist.
alter table public.incoming_invoices drop constraint incoming_invoices_erkannt_aus_check;
alter table public.incoming_invoices
  add constraint incoming_invoices_erkannt_aus_check check (erkannt_aus in ('e-rechnung', 'pdf-text', 'ki', 'keine'));
