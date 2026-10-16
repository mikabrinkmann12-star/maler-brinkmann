-- =============================================================================
-- Kontakte: weitere Felder nach dem Vorbild des Plancraft-Kontaktformulars
-- (Mika, 16.10.2026): Webseite, Empfänger (Briefanschrift, optional von Hand),
-- Zahlungsziel & Skonto und Steuersatz. Die Zahlungs-/Steuerwerte nutzen
-- später Angebote (Phase 4) und die Lexware-Anbindung (Phase 5).
-- =============================================================================

alter table public.contacts
  add column website         text,
  add column empfaenger      text,
  add column zahlungsziel_tage integer check (zahlungsziel_tage between 0 and 365),
  add column skonto_prozent  numeric(4, 2) check (skonto_prozent >= 0 and skonto_prozent <= 20),
  add column skonto_tage     integer check (skonto_tage between 0 and 365),
  add column steuersatz      numeric(4, 1) not null default 19 check (steuersatz in (0, 7, 19)),
  add constraint contacts_skonto_paar check ((skonto_prozent is null) = (skonto_tage is null));

comment on column public.contacts.empfaenger is
  'Briefanschrift von Hand (mehrzeilig). Leer = wird aus Anrede, Name und Adresse gebildet.';
comment on column public.contacts.steuersatz is
  'Umsatzsteuersatz in Prozent für Dokumente an diesen Kunden (0, 7 oder 19).';
