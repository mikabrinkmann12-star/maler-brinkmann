-- =============================================================================
-- Soll-Stunden und Überstundenkonto (Entscheidungen mit Mika, 16.10.2026)
--
-- Pro Mitarbeiter:
--   soll_mo … soll_fr   Soll in Stunden je Wochentag (leer = Standard aus den
--                       Einstellungen „Zeiterfassung“: Mo–Do 8:30, Fr 6:00)
--   konto_ab            erster Tag, ab dem das Überstundenkonto gerechnet wird
--                       (leer = für diese Person wird kein Konto geführt)
--   konto_anfangssaldo  Überstunden-Stand zu diesem Tag (aus Plancraft), auch negativ
--
-- Gerechnet wird in der App (src/lib/ueberstunden.ts). Die Spalten pflegt nur der
-- Admin (RLS von profiles: ändern nur Admin). Lesen darf jeder sein eigenes
-- Profil, das Büro alle – so sieht jeder Mitarbeiter sein eigenes Konto.
-- =============================================================================

alter table public.profiles
  add column soll_mo numeric(4, 2) check (soll_mo between 0 and 12),
  add column soll_di numeric(4, 2) check (soll_di between 0 and 12),
  add column soll_mi numeric(4, 2) check (soll_mi between 0 and 12),
  add column soll_do numeric(4, 2) check (soll_do between 0 and 12),
  add column soll_fr numeric(4, 2) check (soll_fr between 0 and 12),
  add column konto_ab date,
  add column konto_anfangssaldo numeric(7, 2) not null default 0
    check (konto_anfangssaldo between -999 and 999);

comment on column public.profiles.soll_mo is
  'Soll-Stunden am Montag (bei Di–Fr entsprechend). Leer = Standard aus app_settings „zeiterfassung“.';
comment on column public.profiles.konto_ab is
  'Erster Tag des Überstundenkontos. Leer = kein Konto für diese Person.';
comment on column public.profiles.konto_anfangssaldo is
  'Überstunden-Stand (Stunden, auch negativ) am Tag konto_ab.';
