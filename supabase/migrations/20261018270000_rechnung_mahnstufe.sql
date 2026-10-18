-- „Angemahnt“ in den offenen Forderungen (Mika, 18.10.2026, wie in Plancraft).
-- Mahnungen werden in Lexware geschrieben; die API kennt sie nicht. Darum vermerkt das Büro in der App, wie weit eine Rechnung gemahnt wurde.
-- 0 = nicht gemahnt, 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung (letzte). Die Sperre übertragener Rechnungen betrifft diese Spalten nicht.

alter table public.invoices
  add column mahnstufe smallint not null default 0 check (mahnstufe between 0 and 3),
  add column angemahnt_am date,
  add constraint invoices_mahnung_datum check (mahnstufe = 0 or angemahnt_am is not null);
