-- =============================================================================
-- Phase 1.1 – Datenbank für die Mitarbeiter-App
--
-- Neu: app_settings, assignments + assignment_members (Tageseinsatz),
--      time_entries, leave_requests, project_notes, project_photos (+ Storage),
--      material_usage, measurements + measurement_deductions, notifications
-- Kernfeature: Mitarbeiter dürfen Kollegen zu EIGENEN Projekten hinzufügen.
-- Regeln (siehe CLAUDE.md): RLS überall, archivieren statt löschen,
-- Sperrfrist für Zeiten (Monatsende + Kulanztage) in der Datenbank.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Änderungsprotokoll: Datensatz-Kennung auch für Tabellen ohne "id"
-- -----------------------------------------------------------------------------
create or replace function public.protokolliere_aenderung()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alt jsonb;
  v_neu jsonb;
  v_zeile jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_alt := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_neu := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' and (v_alt - 'updated_at') = (v_neu - 'updated_at') then
    return null;
  end if;

  v_zeile := coalesce(v_neu, v_alt);

  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values (
    tg_table_name,
    coalesce(
      v_zeile ->> 'id',
      v_zeile ->> 'schluessel',
      case when v_zeile ? 'assignment_id'
        then concat_ws(':', v_zeile ->> 'assignment_id', v_zeile ->> 'user_id') end,
      concat_ws(':', v_zeile ->> 'project_id', v_zeile ->> 'user_id')
    ),
    tg_op,
    v_alt,
    v_neu,
    (select auth.uid())
  );

  return null;
end;
$$;
revoke execute on function public.protokolliere_aenderung() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Aufzählungstypen
-- -----------------------------------------------------------------------------
create type public.zeit_art as enum (
  'arbeitszeit', 'fahrtzeit', 'urlaub', 'unbezahlter_urlaub',
  'krank', 'schlechtwetter', 'kurzarbeit', 'sonstiges'
);
create type public.urlaub_status as enum ('offen', 'genehmigt', 'abgelehnt', 'zurueckgezogen');
create type public.foto_kategorie as enum ('vorher', 'nachher', 'mangel', 'sonstiges');
create type public.aufmass_einheit as enum ('m2', 'm', 'stk');


-- -----------------------------------------------------------------------------
-- Weitere Hilfsfunktionen (SECURITY DEFINER, search_path = '')
-- -----------------------------------------------------------------------------
create function public.ist_aktiver_nutzer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and aktiv);
$$;

-- Ist p_user_id (nicht der Aufrufer!) Mitglied von p_projekt_id?
create function public.ist_mitglied_von(p_projekt_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_projekt_id and user_id = p_user_id
  );
$$;

-- Liste aller aktiven Kollegen (nur Name + Telefon) für eingeloggte, aktive Nutzer.
-- Ersetzt einen breiteren Lesezugriff auf profiles.
create function public.kollegen()
returns table (id uuid, vorname text, nachname text, telefon text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.vorname, p.nachname, p.telefon
  from public.profiles p
  where p.aktiv
    and exists (select 1 from public.profiles ich where ich.id = (select auth.uid()) and ich.aktiv)
  order by p.vorname, p.nachname;
$$;


-- -----------------------------------------------------------------------------
-- app_settings: Einstellungen als Schlüssel/Wert (nur Admin ändert)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  schluessel  text primary key,
  wert        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) default auth.uid()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.setze_updated_at();

insert into public.app_settings (schluessel, wert) values (
  'zeiterfassung',
  jsonb_build_object(
    'erlaubte_arten', jsonb_build_array('arbeitszeit', 'fahrtzeit', 'schlechtwetter', 'sonstiges'),
    'standard_beginn', '06:30',
    'standard_ende', '15:45',
    'standard_pause_min', 45,
    'kulanz_tage', 3
  )
);

-- Darf der Aufrufer diese Zeit-Art selbst eintragen? (Büro/Admin: immer)
create function public.zeit_art_erlaubt(p_art public.zeit_art)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.ist_buero_oder_admin()
    or coalesce(
      (select (wert -> 'erlaubte_arten') ? p_art::text
       from public.app_settings where schluessel = 'zeiterfassung'),
      false
    );
$$;

-- Sperrfrist: Mitarbeiter dürfen Zeiten ändern, solange der Tag im laufenden
-- Monat liegt, im neuen Monat bis zum Kulanztag auch den Vormonat.
-- Zukunft nie. p_heute nur zum Testen (Standard: heute in Deutschland).
create function public.zeit_noch_aenderbar(p_datum date, p_heute date default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_heute date := coalesce(p_heute, (now() at time zone 'Europe/Berlin')::date);
  v_monatsanfang date := date_trunc('month', v_heute)::date;
  v_kulanz int := coalesce(
    (select (wert ->> 'kulanz_tage')::int from public.app_settings where schluessel = 'zeiterfassung'),
    0
  );
begin
  if p_datum is null or p_datum > v_heute then
    return false;
  end if;
  if p_datum >= v_monatsanfang then
    return true;
  end if;
  return extract(day from v_heute) <= v_kulanz
    and p_datum >= (v_monatsanfang - interval '1 month')::date;
end;
$$;


-- -----------------------------------------------------------------------------
-- assignments: Tageseinsatz (Auto → Baustelle → Mitarbeiter)
-- -----------------------------------------------------------------------------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  datum       date not null,
  vehicle_id  uuid references public.vehicles (id),
  project_id  uuid references public.projects (id),
  notiz       text,   -- Notiz vom Büro, erscheint bei „Heute“
  created_by  uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index assignments_datum_idx on public.assignments (datum);
create index assignments_project_idx on public.assignments (project_id);

create trigger assignments_updated_at
  before update on public.assignments
  for each row execute function public.setze_updated_at();

create table public.assignment_members (
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  user_id        uuid not null references public.profiles (id),
  primary key (assignment_id, user_id)
);
create index assignment_members_user_idx on public.assignment_members (user_id);

create function public.ist_im_einsatz(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignment_members am
    join public.profiles p on p.id = am.user_id
    where am.assignment_id = p_assignment_id
      and am.user_id = (select auth.uid())
      and p.aktiv
  );
$$;

-- Wer eingeteilt wird, wird automatisch Mitglied des Projekts.
create function public.einsatz_mitglieder_uebernehmen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'assignment_members' then
    insert into public.project_members (project_id, user_id, added_by)
    select a.project_id, new.user_id, coalesce((select auth.uid()), a.created_by)
    from public.assignments a
    where a.id = new.assignment_id and a.project_id is not null
    on conflict do nothing;
  elsif new.project_id is not null and new.project_id is distinct from old.project_id then
    insert into public.project_members (project_id, user_id, added_by)
    select new.project_id, am.user_id, coalesce((select auth.uid()), new.created_by)
    from public.assignment_members am
    where am.assignment_id = new.id
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger assignment_members_projekt
  after insert on public.assignment_members
  for each row execute function public.einsatz_mitglieder_uebernehmen();
create trigger assignments_projekt
  after update of project_id on public.assignments
  for each row execute function public.einsatz_mitglieder_uebernehmen();


-- -----------------------------------------------------------------------------
-- time_entries: Zeiten
-- -----------------------------------------------------------------------------
create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) default auth.uid(),
  project_id      uuid references public.projects (id),
  datum           date not null,
  von             time,
  bis             time,
  pause_min       integer not null default 0 check (pause_min >= 0),
  stunden         numeric(5, 2) not null check (stunden >= 0 and stunden <= 24),
  art             public.zeit_art not null default 'arbeitszeit',
  beschreibung    text,
  erstellt_von    uuid references public.profiles (id) default auth.uid(),
  bearbeitet_von  uuid references public.profiles (id),
  archiviert_am   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint time_entries_von_bis check ((von is null) = (bis is null)),
  constraint time_entries_projekt_noetig check (
    art not in ('arbeitszeit', 'fahrtzeit') or project_id is not null
  )
);
create index time_entries_user_datum_idx on public.time_entries (user_id, datum);
create index time_entries_project_idx on public.time_entries (project_id);

-- Stunden aus von/bis/Pause berechnen, Ersteller festhalten, Bearbeiter setzen.
create function public.zeit_vorbereiten()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_minuten numeric;
begin
  if new.von is not null and new.bis is not null then
    if new.bis <= new.von then
      raise exception 'Das Ende muss nach dem Beginn liegen.' using errcode = 'P0001';
    end if;
    v_minuten := extract(epoch from (new.bis - new.von)) / 60 - new.pause_min;
    if v_minuten < 0 then
      raise exception 'Die Pause ist länger als die Arbeitszeit.' using errcode = 'P0001';
    end if;
    new.stunden := round(v_minuten / 60, 2);
  end if;

  if tg_op = 'UPDATE' then
    new.erstellt_von := old.erstellt_von;   -- Ersteller bleibt immer gleich
  end if;
  new.bearbeitet_von := (select auth.uid());
  return new;
end;
$$;

create trigger time_entries_vorbereiten
  before insert or update on public.time_entries
  for each row execute function public.zeit_vorbereiten();
create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- leave_requests: Urlaubsanträge (genehmigt nur der Admin)
-- -----------------------------------------------------------------------------
create table public.leave_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) default auth.uid(),
  von              date not null,
  bis              date not null,
  art              public.zeit_art not null default 'urlaub'
                     check (art in ('urlaub', 'unbezahlter_urlaub')),
  bemerkung        text,
  status           public.urlaub_status not null default 'offen',
  antwort          text,
  entschieden_von  uuid references public.profiles (id),
  entschieden_am   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leave_requests_zeitraum check (bis >= von)
);
create index leave_requests_user_idx on public.leave_requests (user_id);

create function public.urlaub_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.ist_admin() then
    if new.status in ('genehmigt', 'abgelehnt') and new.status is distinct from old.status then
      new.entschieden_von := (select auth.uid());
      new.entschieden_am := now();
    end if;
  else
    -- Alle anderen dürfen nicht entscheiden und keine Entscheidung verändern.
    if new.status in ('genehmigt', 'abgelehnt') then
      raise exception 'Urlaubsanträge kann nur der Admin genehmigen oder ablehnen.' using errcode = 'P0001';
    end if;
    new.antwort := old.antwort;
    new.entschieden_von := old.entschieden_von;
    new.entschieden_am := old.entschieden_am;
  end if;
  return new;
end;
$$;

create trigger leave_requests_pruefen
  before update on public.leave_requests
  for each row execute function public.urlaub_pruefen();
create trigger leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- Baustellen-Inhalte: Notizen, Fotos, Material, Aufmaß
-- -----------------------------------------------------------------------------
create table public.project_notes (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  text           text not null check (length(trim(text)) > 0),
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index project_notes_project_idx on public.project_notes (project_id);

create table public.project_photos (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  storage_pfad   text not null unique,  -- <project_id>/<datei> im Bucket "projektfotos"
  kategorie      public.foto_kategorie not null default 'sonstiges',
  kommentar      text,
  breite         integer,
  hoehe          integer,
  groesse_bytes  integer,
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_photos_pfad check (storage_pfad like project_id::text || '/%')
);
create index project_photos_project_idx on public.project_photos (project_id);

create table public.material_usage (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  material       text not null check (length(trim(material)) > 0),
  material_id    uuid,          -- Verweis auf den Katalog ab Phase 3
  menge          numeric(10, 2) not null check (menge > 0),
  einheit        text not null,
  bemerkung      text,
  erledigt_am    timestamptz,   -- vom Büro abgehakt
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index material_usage_project_idx on public.material_usage (project_id);

create table public.measurements (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  raum           text not null check (length(trim(raum)) > 0),
  position       text not null check (length(trim(position)) > 0),
  einheit        public.aufmass_einheit not null default 'm2',
  laenge         numeric(10, 3) check (laenge >= 0),
  hoehe          numeric(10, 3) check (hoehe >= 0),   -- Breite bzw. Höhe
  anzahl         numeric(10, 2) not null default 1 check (anzahl > 0),
  menge          numeric(12, 3) not null default 0,   -- berechnet von der App (src/lib/aufmass.ts)
  bemerkung      text,
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index measurements_project_idx on public.measurements (project_id);

create table public.measurement_deductions (
  id              uuid primary key default gen_random_uuid(),
  measurement_id  uuid not null references public.measurements (id) on delete cascade,
  bezeichnung     text not null default 'Öffnung',   -- z. B. Fenster, Tür
  breite          numeric(10, 3) not null check (breite > 0),
  hoehe           numeric(10, 3) not null check (hoehe > 0),
  anzahl          numeric(10, 2) not null default 1 check (anzahl > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index measurement_deductions_measurement_idx on public.measurement_deductions (measurement_id);

-- Ersteller einer Zeile bleibt beim Ändern immer gleich.
create function public.ersteller_festhalten()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.erstellt_von := old.erstellt_von;
  return new;
end;
$$;

create trigger project_notes_ersteller before update on public.project_notes
  for each row execute function public.ersteller_festhalten();
create trigger project_photos_ersteller before update on public.project_photos
  for each row execute function public.ersteller_festhalten();
create trigger material_usage_ersteller before update on public.material_usage
  for each row execute function public.ersteller_festhalten();
create trigger measurements_ersteller before update on public.measurements
  for each row execute function public.ersteller_festhalten();

create trigger project_notes_updated_at before update on public.project_notes
  for each row execute function public.setze_updated_at();
create trigger project_photos_updated_at before update on public.project_photos
  for each row execute function public.setze_updated_at();
create trigger material_usage_updated_at before update on public.material_usage
  for each row execute function public.setze_updated_at();
create trigger measurements_updated_at before update on public.measurements
  for each row execute function public.setze_updated_at();
create trigger measurement_deductions_updated_at before update on public.measurement_deductions
  for each row execute function public.setze_updated_at();

-- Darf der Aufrufer dieses Aufmaß sehen bzw. bearbeiten? (für die Abzüge)
create function public.aufmass_sichtbar(p_measurement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.measurements m
    where m.id = p_measurement_id
      and (public.ist_buero_oder_admin() or public.ist_projektmitglied(m.project_id))
  );
$$;

create function public.aufmass_bearbeitbar(p_measurement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.measurements m
    where m.id = p_measurement_id
      and (
        public.ist_buero_oder_admin()
        or (m.erstellt_von = (select auth.uid()) and public.ist_projektmitglied(m.project_id))
      )
  );
$$;


-- -----------------------------------------------------------------------------
-- notifications: Hinweise fürs Büro (gemeinsamer Posteingang)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id              bigint generated always as identity primary key,
  typ             text not null,
  text            text not null,
  project_id      uuid references public.projects (id),
  ausgeloest_von  uuid references public.profiles (id),
  gelesen_am      timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_created_idx on public.notifications (created_at desc);

create function public.benachrichtige_buero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wer text;
begin
  select trim(vorname || ' ' || nachname) into v_wer
  from public.profiles where id = (select auth.uid());

  if tg_table_name = 'project_members' then
    -- Nur wenn ein Mitarbeiter selbst jemanden hinzufügt (nicht Büro/Einteilung)
    if (select auth.uid()) is null or public.ist_buero_oder_admin() then
      return null;
    end if;
    insert into public.notifications (typ, text, project_id, ausgeloest_von)
    select
      'kollege_hinzugefuegt',
      format('%s hat %s zu „%s“ hinzugefügt.', v_wer, trim(p.vorname || ' ' || p.nachname), pr.name),
      new.project_id,
      (select auth.uid())
    from public.profiles p, public.projects pr
    where p.id = new.user_id and pr.id = new.project_id;

  elsif tg_table_name = 'leave_requests' then
    insert into public.notifications (typ, text, ausgeloest_von)
    select
      'urlaubsantrag',
      format('%s beantragt %s vom %s bis %s.',
        trim(p.vorname || ' ' || p.nachname),
        case when new.art = 'urlaub' then 'Urlaub' else 'unbezahlten Urlaub' end,
        to_char(new.von, 'DD.MM.YYYY'), to_char(new.bis, 'DD.MM.YYYY')),
      new.user_id
    from public.profiles p where p.id = new.user_id;
  end if;
  return null;
end;
$$;

create trigger project_members_benachrichtigen
  after insert on public.project_members
  for each row execute function public.benachrichtige_buero();
create trigger leave_requests_benachrichtigen
  after insert on public.leave_requests
  for each row execute function public.benachrichtige_buero();


-- -----------------------------------------------------------------------------
-- Änderungsprotokoll für alle neuen Tabellen
-- -----------------------------------------------------------------------------
create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.protokolliere_aenderung();
create trigger assignments_audit after insert or update or delete on public.assignments
  for each row execute function public.protokolliere_aenderung();
create trigger assignment_members_audit after insert or update or delete on public.assignment_members
  for each row execute function public.protokolliere_aenderung();
create trigger time_entries_audit after insert or update or delete on public.time_entries
  for each row execute function public.protokolliere_aenderung();
create trigger leave_requests_audit after insert or update or delete on public.leave_requests
  for each row execute function public.protokolliere_aenderung();
create trigger project_notes_audit after insert or update or delete on public.project_notes
  for each row execute function public.protokolliere_aenderung();
create trigger project_photos_audit after insert or update or delete on public.project_photos
  for each row execute function public.protokolliere_aenderung();
create trigger material_usage_audit after insert or update or delete on public.material_usage
  for each row execute function public.protokolliere_aenderung();
create trigger measurements_audit after insert or update or delete on public.measurements
  for each row execute function public.protokolliere_aenderung();
create trigger measurement_deductions_audit after insert or update or delete on public.measurement_deductions
  for each row execute function public.protokolliere_aenderung();


-- -----------------------------------------------------------------------------
-- Rechte auf Funktionen
-- -----------------------------------------------------------------------------
-- RLS-/App-Hilfsfunktionen: nur eingeloggte Nutzer
revoke execute on function public.ist_aktiver_nutzer(uuid)              from public, anon;
revoke execute on function public.ist_mitglied_von(uuid, uuid)          from public, anon;
revoke execute on function public.kollegen()                            from public, anon;
revoke execute on function public.zeit_art_erlaubt(public.zeit_art)     from public, anon;
revoke execute on function public.zeit_noch_aenderbar(date, date)       from public, anon;
revoke execute on function public.ist_im_einsatz(uuid)                  from public, anon;
revoke execute on function public.aufmass_sichtbar(uuid)                from public, anon;
revoke execute on function public.aufmass_bearbeitbar(uuid)             from public, anon;
grant  execute on function public.ist_aktiver_nutzer(uuid)              to authenticated;
grant  execute on function public.ist_mitglied_von(uuid, uuid)          to authenticated;
grant  execute on function public.kollegen()                            to authenticated;
grant  execute on function public.zeit_art_erlaubt(public.zeit_art)     to authenticated;
grant  execute on function public.zeit_noch_aenderbar(date, date)       to authenticated;
grant  execute on function public.ist_im_einsatz(uuid)                  to authenticated;
grant  execute on function public.aufmass_sichtbar(uuid)                to authenticated;
grant  execute on function public.aufmass_bearbeitbar(uuid)             to authenticated;

-- Trigger-Funktionen: niemand direkt
revoke execute on function public.einsatz_mitglieder_uebernehmen()  from public, anon, authenticated;
revoke execute on function public.zeit_vorbereiten()                from public, anon, authenticated;
revoke execute on function public.urlaub_pruefen()                  from public, anon, authenticated;
revoke execute on function public.ersteller_festhalten()            from public, anon, authenticated;
revoke execute on function public.benachrichtige_buero()            from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Tabellenrechte: kein TRUNCATE, notifications nur über Trigger anlegen
-- -----------------------------------------------------------------------------
revoke truncate on public.app_settings, public.assignments, public.assignment_members,
  public.time_entries, public.leave_requests, public.project_notes, public.project_photos,
  public.material_usage, public.measurements, public.measurement_deductions,
  public.notifications
  from anon, authenticated;
revoke insert, delete on public.notifications from anon, authenticated;


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.app_settings            enable row level security;
alter table public.assignments             enable row level security;
alter table public.assignment_members      enable row level security;
alter table public.time_entries            enable row level security;
alter table public.leave_requests          enable row level security;
alter table public.project_notes           enable row level security;
alter table public.project_photos          enable row level security;
alter table public.material_usage          enable row level security;
alter table public.measurements            enable row level security;
alter table public.measurement_deductions  enable row level security;
alter table public.notifications           enable row level security;

-- Kernfeature: Mitarbeiter fügt Kollegen zu einem EIGENEN Projekt hinzu.
-- (Die Policy fürs Büro besteht schon. Entfernen dürfen weiter nur Büro/Admin.)
create policy project_members_kollege_hinzufuegen on public.project_members
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and public.ist_projektmitglied(project_id)
    and public.ist_aktiver_nutzer(user_id)
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.archiviert_am is null
    )
  );

-- app_settings: alle aktiven Nutzer lesen, nur Admin ändert
create policy app_settings_lesen on public.app_settings
  for select to authenticated using ((select public.ist_aktiv()));
create policy app_settings_anlegen on public.app_settings
  for insert to authenticated with check ((select public.ist_admin()));
create policy app_settings_aendern on public.app_settings
  for update to authenticated
  using ((select public.ist_admin())) with check ((select public.ist_admin()));

-- assignments: Büro/Admin planen, Mitarbeiter sehen ihre eigenen Einsätze
create policy assignments_lesen on public.assignments
  for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_im_einsatz(id));
create policy assignments_anlegen on public.assignments
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy assignments_aendern on public.assignments
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
create policy assignments_loeschen on public.assignments
  for delete to authenticated using ((select public.ist_buero_oder_admin()));

create policy assignment_members_lesen on public.assignment_members
  for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_im_einsatz(assignment_id));
create policy assignment_members_anlegen on public.assignment_members
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy assignment_members_loeschen on public.assignment_members
  for delete to authenticated using ((select public.ist_buero_oder_admin()));

-- time_entries
create policy time_entries_lesen on public.time_entries
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.ist_aktiv()))
    or (select public.ist_buero_oder_admin())
  );

create policy time_entries_anlegen_buero on public.time_entries
  for insert to authenticated
  with check ((select public.ist_buero_oder_admin()) and erstellt_von = (select auth.uid()));

create policy time_entries_anlegen_mitarbeiter on public.time_entries
  for insert to authenticated
  with check (
    (select public.ist_aktiv())
    and erstellt_von = (select auth.uid())
    and public.zeit_noch_aenderbar(datum)
    and public.zeit_art_erlaubt(art)
    and (
      -- für sich selbst
      (user_id = (select auth.uid())
        and (project_id is null or public.ist_projektmitglied(project_id)))
      -- für einen Kollegen derselben Baustelle
      or (user_id <> (select auth.uid())
        and project_id is not null
        and public.ist_projektmitglied(project_id)
        and public.ist_mitglied_von(project_id, user_id)
        and public.ist_aktiver_nutzer(user_id))
    )
  );

create policy time_entries_aendern_buero on public.time_entries
  for update to authenticated
  using ((select public.ist_buero_oder_admin()))
  with check ((select public.ist_buero_oder_admin()));

create policy time_entries_aendern_mitarbeiter on public.time_entries
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.ist_aktiv())
    and public.zeit_noch_aenderbar(datum)
  )
  with check (
    user_id = (select auth.uid())
    and public.zeit_noch_aenderbar(datum)
    and public.zeit_art_erlaubt(art)
    and (project_id is null or public.ist_projektmitglied(project_id))
  );

-- leave_requests
create policy leave_requests_lesen on public.leave_requests
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.ist_aktiv()))
    or (select public.ist_buero_oder_admin())
  );
create policy leave_requests_anlegen on public.leave_requests
  for insert to authenticated
  with check (
    (select public.ist_aktiv())
    and status = 'offen'
    and entschieden_von is null
    and (user_id = (select auth.uid()) or (select public.ist_admin()))
  );
create policy leave_requests_aendern_admin on public.leave_requests
  for update to authenticated
  using ((select public.ist_admin())) with check ((select public.ist_admin()));
create policy leave_requests_aendern_eigene on public.leave_requests
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'offen' and (select public.ist_aktiv()))
  with check (user_id = (select auth.uid()) and status in ('offen', 'zurueckgezogen'));

-- Notizen, Fotos, Material, Aufmaß: gleiches Muster
--   lesen:    Büro/Admin oder Projektmitglied
--   anlegen:  Büro/Admin oder Projektmitglied, als man selbst
--   ändern:   Büro/Admin oder eigener Eintrag (solange Mitglied)
--   löschen:  niemand (archivieren)
create policy project_notes_lesen on public.project_notes for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy project_notes_anlegen on public.project_notes for insert to authenticated
  with check (erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy project_notes_aendern on public.project_notes for update to authenticated
  using ((select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));

create policy project_photos_lesen on public.project_photos for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy project_photos_anlegen on public.project_photos for insert to authenticated
  with check (erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy project_photos_aendern on public.project_photos for update to authenticated
  using ((select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));

create policy material_usage_lesen on public.material_usage for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy material_usage_anlegen on public.material_usage for insert to authenticated
  with check (erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy material_usage_aendern on public.material_usage for update to authenticated
  using ((select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));

create policy measurements_lesen on public.measurements for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy measurements_anlegen on public.measurements for insert to authenticated
  with check (erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy measurements_aendern on public.measurements for update to authenticated
  using ((select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));

-- Abzüge gehören zum Aufmaß (Bearbeiten = auch löschen erlaubt)
create policy measurement_deductions_lesen on public.measurement_deductions for select to authenticated
  using (public.aufmass_sichtbar(measurement_id));
create policy measurement_deductions_anlegen on public.measurement_deductions for insert to authenticated
  with check (public.aufmass_bearbeitbar(measurement_id));
create policy measurement_deductions_aendern on public.measurement_deductions for update to authenticated
  using (public.aufmass_bearbeitbar(measurement_id)) with check (public.aufmass_bearbeitbar(measurement_id));
create policy measurement_deductions_loeschen on public.measurement_deductions for delete to authenticated
  using (public.aufmass_bearbeitbar(measurement_id));

-- notifications: nur Büro/Admin lesen und als gelesen markieren
create policy notifications_lesen on public.notifications for select to authenticated
  using ((select public.ist_buero_oder_admin()));
create policy notifications_aendern on public.notifications for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));


-- -----------------------------------------------------------------------------
-- Storage: privater Bucket für Baustellenfotos
-- Pfad: <project_id>/<dateiname>. Zugriff wie bei project_photos.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projektfotos', 'projektfotos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Projekt-ID aus dem Dateipfad lesen (ungültig → null, statt Fehler)
create function public.projekt_aus_pfad(p_pfad text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_pfad, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_pfad, '/', 1)::uuid
  end;
$$;
revoke execute on function public.projekt_aus_pfad(text) from public, anon;
grant  execute on function public.projekt_aus_pfad(text) to authenticated;

create policy projektfotos_lesen on storage.objects for select to authenticated
  using (
    bucket_id = 'projektfotos'
    and ((select public.ist_buero_oder_admin())
      or public.ist_projektmitglied(public.projekt_aus_pfad(name)))
  );
create policy projektfotos_hochladen on storage.objects for insert to authenticated
  with check (
    bucket_id = 'projektfotos'
    and public.projekt_aus_pfad(name) is not null
    and ((select public.ist_buero_oder_admin())
      or public.ist_projektmitglied(public.projekt_aus_pfad(name)))
  );
-- Kein Ändern/Löschen von Fotos über die App (archivieren über project_photos).
