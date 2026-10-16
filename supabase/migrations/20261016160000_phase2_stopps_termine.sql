-- =============================================================================
-- Phase 2 – Plantafel
--
-- 1. Mehrere Baustellen („Stopps“) pro Einsatz. Ein Auto hat ein festes Team
--    für den Tag (assignment_members) und fährt mehrere Baustellen an. Pro Stopp
--    gibt es optional eine Zeit: „muss da sein um“ (um) oder „kann ab“ (ab).
--    Ohne Zeit entscheiden die Mitarbeiter selbst über die Reihenfolge.
--    Bisher stand die Baustelle direkt im Einsatz (assignments.project_id):
--    bestehende Werte werden in Stopps überführt, die Spalte entfällt.
-- 2. Termine (Kalender): Jeder Mitarbeiter trägt eigene Termine ein, das Büro
--    für alle. Büro/Admin sehen alle, Mitarbeiter nur ihre eigenen.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Stopps
-- -----------------------------------------------------------------------------
create type public.stopp_zeit_art as enum ('um', 'ab');

create table public.assignment_stops (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  project_id     uuid not null references public.projects (id),
  sortierung     integer not null default 0,
  zeit           time,
  zeit_art       public.stopp_zeit_art,
  notiz          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint assignment_stops_zeit_paar check ((zeit is null) = (zeit_art is null)),
  constraint assignment_stops_eindeutig unique (assignment_id, project_id)
);
create index assignment_stops_assignment_idx on public.assignment_stops (assignment_id);
create index assignment_stops_project_idx on public.assignment_stops (project_id);

create trigger assignment_stops_updated_at
  before update on public.assignment_stops
  for each row execute function public.setze_updated_at();

-- Bestehende Baustellen der Einsätze werden zum ersten Stopp.
insert into public.assignment_stops (assignment_id, project_id)
select id, project_id from public.assignments where project_id is not null;

drop trigger assignments_projekt on public.assignments;
alter table public.assignments drop column project_id;

-- Wer eingeteilt wird, wird automatisch Mitglied ALLER Projekte der Stopps
-- (egal ob zuerst das Team oder zuerst der Stopp gespeichert wird).
create or replace function public.einsatz_mitglieder_uebernehmen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'assignment_members' then
    insert into public.project_members (project_id, user_id, added_by)
    select s.project_id, new.user_id, coalesce((select auth.uid()), a.created_by)
    from public.assignment_stops s
    join public.assignments a on a.id = s.assignment_id
    where s.assignment_id = new.assignment_id
    on conflict do nothing;
  else
    insert into public.project_members (project_id, user_id, added_by)
    select new.project_id, am.user_id, coalesce((select auth.uid()), a.created_by)
    from public.assignment_members am
    join public.assignments a on a.id = am.assignment_id
    where am.assignment_id = new.assignment_id
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.einsatz_mitglieder_uebernehmen() from public, anon, authenticated;

create trigger assignment_stops_projekt
  after insert or update of project_id on public.assignment_stops
  for each row execute function public.einsatz_mitglieder_uebernehmen();

create trigger assignment_stops_audit after insert or update or delete on public.assignment_stops
  for each row execute function public.protokolliere_aenderung();

revoke truncate on public.assignment_stops from anon, authenticated;
alter table public.assignment_stops enable row level security;

create policy assignment_stops_lesen on public.assignment_stops
  for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_im_einsatz(assignment_id));
create policy assignment_stops_anlegen on public.assignment_stops
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy assignment_stops_aendern on public.assignment_stops
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
create policy assignment_stops_loeschen on public.assignment_stops
  for delete to authenticated using ((select public.ist_buero_oder_admin()));


-- -----------------------------------------------------------------------------
-- 2. Termine
-- -----------------------------------------------------------------------------
create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  datum          date not null,
  titel          text not null check (length(trim(titel)) > 0),
  ort            text,
  zeit           time,
  project_id     uuid references public.projects (id),
  notiz          text,
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index appointments_datum_idx on public.appointments (datum);

create table public.appointment_members (
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  user_id         uuid not null references public.profiles (id),
  primary key (appointment_id, user_id)
);
create index appointment_members_user_idx on public.appointment_members (user_id);

create trigger appointments_ersteller before update on public.appointments
  for each row execute function public.ersteller_festhalten();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.setze_updated_at();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function public.protokolliere_aenderung();
create trigger appointment_members_audit after insert or update or delete on public.appointment_members
  for each row execute function public.protokolliere_aenderung();

create function public.ist_im_termin(p_termin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointment_members m
    join public.profiles p on p.id = m.user_id
    where m.appointment_id = p_termin_id
      and m.user_id = (select auth.uid())
      and p.aktiv
  );
$$;

create function public.ist_termin_ersteller(p_termin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.id = p_termin_id and a.erstellt_von = (select auth.uid())
  );
$$;

revoke execute on function public.ist_im_termin(uuid)        from public, anon;
revoke execute on function public.ist_termin_ersteller(uuid) from public, anon;
grant  execute on function public.ist_im_termin(uuid)        to authenticated;
grant  execute on function public.ist_termin_ersteller(uuid) to authenticated;

-- Trägt ein Mitarbeiter einen Termin ein, bekommt das Büro einen Hinweis.
create function public.benachrichtige_termin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.ist_buero_oder_admin() then
    return null;
  end if;
  insert into public.notifications (typ, text, project_id, ausgeloest_von)
  select
    'termin',
    format('%s hat einen Termin eingetragen: „%s“ am %s.',
      trim(p.vorname || ' ' || p.nachname), new.titel, to_char(new.datum, 'DD.MM.YYYY')),
    new.project_id,
    (select auth.uid())
  from public.profiles p where p.id = (select auth.uid());
  return null;
end;
$$;
revoke execute on function public.benachrichtige_termin() from public, anon, authenticated;

create trigger appointments_benachrichtigen
  after insert on public.appointments
  for each row execute function public.benachrichtige_termin();

revoke truncate on public.appointments, public.appointment_members from anon, authenticated;
alter table public.appointments        enable row level security;
alter table public.appointment_members enable row level security;

-- Termine: Büro/Admin alles; Mitarbeiter sehen und legen nur eigene an.
create policy appointments_lesen on public.appointments
  for select to authenticated
  using (
    (select public.ist_buero_oder_admin())
    or ((erstellt_von = (select auth.uid()) or public.ist_im_termin(id)) and (select public.ist_aktiv()))
  );
create policy appointments_anlegen on public.appointments
  for insert to authenticated
  with check (
    (select public.ist_aktiv())
    and erstellt_von = (select auth.uid())
    and (
      (select public.ist_buero_oder_admin())
      or project_id is null
      or public.ist_projektmitglied(project_id)
    )
  );
create policy appointments_aendern on public.appointments
  for update to authenticated
  using ((select public.ist_buero_oder_admin()) or (erstellt_von = (select auth.uid()) and (select public.ist_aktiv())))
  with check (
    (select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and (project_id is null or public.ist_projektmitglied(project_id)))
  );

create policy appointment_members_lesen on public.appointment_members
  for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_im_termin(appointment_id)
         or public.ist_termin_ersteller(appointment_id));
-- Mitarbeiter tragen nur sich selbst in ihren eigenen Termin ein, das Büro jeden.
create policy appointment_members_anlegen on public.appointment_members
  for insert to authenticated
  with check (
    (select public.ist_buero_oder_admin())
    or (user_id = (select auth.uid()) and public.ist_termin_ersteller(appointment_id) and (select public.ist_aktiv()))
  );
create policy appointment_members_loeschen on public.appointment_members
  for delete to authenticated using ((select public.ist_buero_oder_admin()));
