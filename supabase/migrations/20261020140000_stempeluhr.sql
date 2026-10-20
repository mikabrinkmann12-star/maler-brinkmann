-- Stempeluhr der Mitarbeiter-App (Mika, 20.10.2026): „Zum Einstempeln wischen“.
-- Ein laufender Eintrag liegt hier (höchstens einer pro Person) und überlebt so Handy-Wechsel und App-Neustart.
-- Beim Ausstempeln legt der Server aus Beginn und Ende einen normalen Zeiteintrag in time_entries an
-- (mit eintrag_id, damit ein zweiter Versuch nach einem Funkloch nichts doppelt speichert) und räumt diese Zeile weg.
-- Das ist nur ein Zwischenstand, keine Zeiten-Daten: Es wird hier nichts „gelöscht“, das bleibt.

create table public.stempeluhr (
  user_id       uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  project_id    uuid not null references public.projects (id),
  art           public.zeit_art not null default 'arbeitszeit',
  gestartet_am  timestamptz not null default now(),
  eintrag_id    uuid not null default gen_random_uuid()
);

comment on table public.stempeluhr is
  'Laufende Stempeluhr (höchstens eine pro Person). Beim Ausstempeln entsteht ein Eintrag in time_entries.';

-- Beginn und Eintrags-ID ändern sich nie (die App schickt sie nicht, die Datenbank hält sie fest)
create function public.stempeluhr_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := old.user_id;
  new.gestartet_am := old.gestartet_am;
  new.eintrag_id := old.eintrag_id;
  return new;
end;
$$;
create trigger stempeluhr_schuetzen before update on public.stempeluhr
  for each row execute function public.stempeluhr_schuetzen();
revoke execute on function public.stempeluhr_schuetzen() from public, anon, authenticated;

alter table public.stempeluhr enable row level security;
revoke all on public.stempeluhr from anon;
grant select, insert, update, delete on public.stempeluhr to authenticated;

-- Jeder aktive Nutzer sieht und steuert nur seine eigene Uhr, und nur auf einem Projekt,
-- das er sehen darf (Mitglied oder Büro) und das nicht archiviert ist.
create policy stempeluhr_lesen on public.stempeluhr for select to authenticated
  using (user_id = (select auth.uid()) and (select public.ist_aktiv()));

create policy stempeluhr_anlegen on public.stempeluhr for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.ist_aktiv())
    and exists (select 1 from public.projects p where p.id = project_id and p.archiviert_am is null)
    and ((select public.ist_buero_oder_admin()) or (select public.ist_mitglied_von(project_id, (select auth.uid()))))
  );

create policy stempeluhr_aendern on public.stempeluhr for update to authenticated
  using (user_id = (select auth.uid()) and (select public.ist_aktiv()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.archiviert_am is null)
    and ((select public.ist_buero_oder_admin()) or (select public.ist_mitglied_von(project_id, (select auth.uid()))))
  );

create policy stempeluhr_entfernen on public.stempeluhr for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.ist_aktiv()));
