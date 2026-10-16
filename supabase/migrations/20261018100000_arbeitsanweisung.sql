-- =============================================================================
-- Arbeitsanweisung aus dem Angebot (Phase 4, Wunsch von Mika, 17.10.2026)
--
-- Aus den Positionen eines Angebots entsteht eine Arbeitsanweisung in Stichpunkten, OHNE Preise
-- (nur Arbeit und Mengen). Mitarbeiter dürfen keine Angebote sehen, deshalb ist die Arbeitsanweisung
-- eine eigene Tabelle: Das Büro erstellt und prüft sie, erst nach der Freigabe sehen sie die
-- Mitarbeiter des Projekts. Nichts wird gelöscht (archivieren).
-- =============================================================================

create table public.work_instructions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  quote_id       uuid references public.quotes (id),
  titel          text not null check (length(btrim(titel)) between 1 and 200),
  inhalt         text not null check (length(inhalt) <= 20000),
  freigegeben_am timestamptz,
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index work_instructions_project_idx on public.work_instructions (project_id);

-- Pro Angebot gibt es höchstens eine aktive Arbeitsanweisung.
create unique index work_instructions_pro_angebot
  on public.work_instructions (quote_id) where quote_id is not null and archiviert_am is null;

create trigger work_instructions_updated_at before update on public.work_instructions
  for each row execute function public.setze_updated_at();
create trigger work_instructions_audit after insert or update or delete on public.work_instructions
  for each row execute function public.protokolliere_aenderung();

alter table public.work_instructions enable row level security;

-- Büro/Admin: alles sehen, anlegen, ändern. Mitarbeiter: nur freigegebene Anweisungen ihrer Projekte
-- (und freigegebene aus archivierten Projekten, wie die übrigen Inhalte archivierter Projekte).
create policy work_instructions_lesen on public.work_instructions
  for select to authenticated
  using ((select public.ist_buero_oder_admin())
    or (freigegeben_am is not null and archiviert_am is null
        and (public.ist_projektmitglied(project_id) or public.ist_archiviertes_projekt(project_id))));
create policy work_instructions_anlegen on public.work_instructions
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy work_instructions_aendern on public.work_instructions
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
