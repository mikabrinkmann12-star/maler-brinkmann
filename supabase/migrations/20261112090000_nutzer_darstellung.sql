-- Darstellung je Nutzer (Mika, 11.11.2026): Farbsatz und Seitenleiste (Reihenfolge, ausgeblendete Punkte) selbst einstellen.
-- null bedeutet jeweils „Vorgabe der Firma“ (app_settings „darstellung“, vom Admin bzw. Recht „einstellungen_firma“ gesetzt).
-- Reine Optik: Was jemand sehen darf, regeln weiterhin Rechte, RLS und Server.
create table public.nutzer_darstellung (
  nutzer_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  akzent        text check (akzent is null or akzent in ('gruen', 'blau', 'petrol', 'graphit', 'bordeaux')),
  reihenfolge   text[] check (reihenfolge is null or cardinality(reihenfolge) <= 50),
  ausgeblendet  text[] check (ausgeblendet is null or cardinality(ausgeblendet) <= 50),
  updated_at    timestamptz not null default now()
);

comment on table public.nutzer_darstellung is 'Darstellung je Nutzer (Farbsatz, Reihenfolge und ausgeblendete Punkte der Büro-Seitenleiste); null = Vorgabe der Firma';

create trigger nutzer_darstellung_updated_at
  before update on public.nutzer_darstellung
  for each row execute function public.setze_updated_at();

alter table public.nutzer_darstellung enable row level security;

-- Jeder aktive Nutzer liest und ändert nur seine eigene Zeile. Kein Löschen nötig („zurücksetzen“ setzt die Werte auf null).
create policy nutzer_darstellung_lesen on public.nutzer_darstellung
  for select to authenticated using (nutzer_id = (select auth.uid()) and (select public.ist_aktiv()));
create policy nutzer_darstellung_anlegen on public.nutzer_darstellung
  for insert to authenticated with check (nutzer_id = (select auth.uid()) and (select public.ist_aktiv()));
create policy nutzer_darstellung_aendern on public.nutzer_darstellung
  for update to authenticated
  using (nutzer_id = (select auth.uid()) and (select public.ist_aktiv()))
  with check (nutzer_id = (select auth.uid()) and (select public.ist_aktiv()));
