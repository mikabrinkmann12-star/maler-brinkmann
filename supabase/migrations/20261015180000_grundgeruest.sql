-- =============================================================================
-- Phase 0.2 – Grundgerüst der Datenbank
-- Tabellen: profiles, project_statuses, contacts, projects, project_members,
--           vehicles, audit_log
-- Regeln (siehe CLAUDE.md):
--   * Jede Tabelle hat RLS.
--   * profiles.rolle ist die einzige Quelle für Rechte (nie JWT/app_metadata).
--   * Hilfsfunktionen: SECURITY DEFINER, STABLE, search_path = '' .
--   * Admin-Funktionen nur für service_role ausführbar.
--   * Keine DELETE-Policies für Projekte/Kontakte → archivieren.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Aufzählungstypen
-- -----------------------------------------------------------------------------
create type public.app_rolle as enum ('admin', 'buero', 'mitarbeiter');
create type public.kontakt_typ as enum ('firma', 'privat');


-- -----------------------------------------------------------------------------
-- updated_at automatisch setzen
-- -----------------------------------------------------------------------------
create function public.setze_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- profiles: ein Eintrag pro Login (auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  benutzername          text not null unique
                          check (benutzername ~ '^[a-z0-9][a-z0-9._-]{1,30}$'),
  vorname               text not null check (length(trim(vorname)) > 0),
  nachname              text not null default '',
  rolle                 public.app_rolle not null default 'mitarbeiter',
  email                 text,   -- optionale Kontakt-E-Mail, NICHT die Login-Adresse
  telefon               text,
  aktiv                 boolean not null default true,
  muss_passwort_aendern boolean not null default true,
  arbeitszeitmodell     text,   -- Details folgen in Phase 3
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.profiles is
  'Nutzerprofile. rolle ist die einzige Quelle für Rechte.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- RLS-Hilfsfunktionen
-- SECURITY DEFINER: Sie lesen profiles/project_members ohne selbst RLS
-- auszulösen (sonst Endlos-Rekursion in den Policies von profiles).
-- Alle zählen nur AKTIVE Nutzer.
-- -----------------------------------------------------------------------------
create function public.ist_aktiv()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and aktiv
  );
$$;

create function public.ist_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and aktiv and rolle = 'admin'
  );
$$;

create function public.ist_buero_oder_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and aktiv and rolle in ('admin', 'buero')
  );
$$;


-- -----------------------------------------------------------------------------
-- project_statuses: frei verwaltbare Projektstatus mit Farbe
-- -----------------------------------------------------------------------------
create table public.project_statuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  farbe       text not null default '#64748b' check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  sortierung  integer not null default 0,
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger project_statuses_updated_at
  before update on public.project_statuses
  for each row execute function public.setze_updated_at();

-- Start-Status (Stammdaten, gehören auch in Live)
insert into public.project_statuses (name, farbe, sortierung) values
  ('Entwurf',               '#94a3b8', 10),
  ('Angebot',               '#3b82f6', 20),
  ('Auftrag erteilt',       '#6366f1', 30),
  ('In Arbeit',             '#f59e0b', 40),
  ('Rechnung angelegt',     '#f97316', 50),
  ('Rechnung geschrieben',  '#a855f7', 60),
  ('Abgeschlossen',         '#22c55e', 70),
  ('Anders vergeben',       '#64748b', 80),
  ('Abgelehnt von uns',     '#ef4444', 90);


-- -----------------------------------------------------------------------------
-- contacts: Kunden (Firma oder Privat)
-- -----------------------------------------------------------------------------
create table public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  kundennummer        text unique,
  typ                 public.kontakt_typ not null default 'privat',
  firmenname          text,
  anrede              text,
  vorname             text,
  nachname            text,
  strasse             text,
  plz                 text,
  ort                 text,
  ansprechpartner     text,
  telefon             text,
  mobil               text,
  email               text,
  notizen             text,
  lexware_contact_id  text unique,
  archiviert_am       timestamptz,
  created_by          uuid references public.profiles (id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint contacts_name_vorhanden check (
    coalesce(trim(firmenname), '') <> '' or coalesce(trim(nachname), '') <> ''
  )
);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- projects: Baustellen / Aufträge
-- -----------------------------------------------------------------------------
create table public.projects (
  id                        uuid primary key default gen_random_uuid(),
  projektnummer             text not null unique,
  name                      text not null check (length(trim(name)) > 0),
  contact_id                uuid references public.contacts (id),
  baustelle_strasse         text,
  baustelle_plz             text,
  baustelle_ort             text,
  status_id                 uuid not null references public.project_statuses (id),
  start_datum               date,
  end_datum                 date,
  beschreibung              text,
  buero_ansprechpartner_id  uuid references public.profiles (id),
  archiviert_am             timestamptz,
  created_by                uuid references public.profiles (id) default auth.uid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint projects_zeitraum check (
    start_datum is null or end_datum is null or end_datum >= start_datum
  )
);

create index projects_contact_id_idx on public.projects (contact_id);
create index projects_status_id_idx on public.projects (status_id);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- project_members: wer ist auf welchem Projekt eingetragen
-- -----------------------------------------------------------------------------
create table public.project_members (
  project_id  uuid not null references public.projects (id),
  user_id     uuid not null references public.profiles (id),
  added_by    uuid references public.profiles (id) default auth.uid(),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_id_idx on public.project_members (user_id);

-- Braucht project_members, deshalb erst hier.
create function public.ist_projektmitglied(p_projekt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members pm
    join public.profiles p on p.id = pm.user_id
    where pm.project_id = p_projekt_id
      and pm.user_id = (select auth.uid())
      and p.aktiv
  );
$$;


-- -----------------------------------------------------------------------------
-- vehicles: Firmenfahrzeuge
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  kennzeichen  text unique,
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.setze_updated_at();


-- -----------------------------------------------------------------------------
-- audit_log: wer hat was wann geändert
-- Wird nur vom Trigger beschrieben. Kein Fremdschlüssel auf profiles,
-- damit Protokolle immer erhalten bleiben.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id             bigint generated always as identity primary key,
  tabelle        text not null,
  datensatz_id   text not null,
  aktion         text not null check (aktion in ('INSERT', 'UPDATE', 'DELETE')),
  alt            jsonb,
  neu            jsonb,
  geaendert_von  uuid,
  geaendert_am   timestamptz not null default now()
);

create index audit_log_datensatz_idx on public.audit_log (tabelle, datensatz_id);
create index audit_log_geaendert_am_idx on public.audit_log (geaendert_am desc);

create function public.protokolliere_aenderung()
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

  -- Änderungen, die nur updated_at betreffen, nicht protokollieren
  if tg_op = 'UPDATE' and (v_alt - 'updated_at') = (v_neu - 'updated_at') then
    return null;
  end if;

  v_zeile := coalesce(v_neu, v_alt);

  insert into public.audit_log (tabelle, datensatz_id, aktion, alt, neu, geaendert_von)
  values (
    tg_table_name,
    coalesce(
      v_zeile ->> 'id',
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

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.protokolliere_aenderung();
create trigger project_statuses_audit
  after insert or update or delete on public.project_statuses
  for each row execute function public.protokolliere_aenderung();
create trigger contacts_audit
  after insert or update or delete on public.contacts
  for each row execute function public.protokolliere_aenderung();
create trigger projects_audit
  after insert or update or delete on public.projects
  for each row execute function public.protokolliere_aenderung();
create trigger project_members_audit
  after insert or update or delete on public.project_members
  for each row execute function public.protokolliere_aenderung();
create trigger vehicles_audit
  after insert or update or delete on public.vehicles
  for each row execute function public.protokolliere_aenderung();


-- -----------------------------------------------------------------------------
-- Schutz: Es muss immer mindestens ein aktiver Admin übrig bleiben,
-- und ein Admin kann sich nicht selbst die Admin-Rolle nehmen oder sich
-- deaktivieren.
-- -----------------------------------------------------------------------------
create function public.schuetze_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rolle = 'admin' and old.aktiv
     and (new.rolle <> 'admin' or not new.aktiv) then

    if old.id = (select auth.uid()) then
      raise exception 'Du kannst dir nicht selbst die Admin-Rolle nehmen oder dich deaktivieren.'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from public.profiles
      where rolle = 'admin' and aktiv and id <> old.id
    ) then
      raise exception 'Es muss mindestens ein aktiver Admin bleiben.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_schuetze_admins
  before update on public.profiles
  for each row execute function public.schuetze_admins();


-- -----------------------------------------------------------------------------
-- Neuer Auth-User → Profil anlegen.
-- Startwerte kommen EINMALIG aus app_metadata (nur der Server mit Secret Key
-- kann das setzen). Danach gilt ausschließlich profiles.
-- Ohne benutzername/vorname schlägt das Anlegen absichtlich fehl.
-- -----------------------------------------------------------------------------
create function public.neuer_auth_nutzer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, benutzername, vorname, nachname, rolle, email, telefon, muss_passwort_aendern
  )
  values (
    new.id,
    lower(new.raw_app_meta_data ->> 'benutzername'),
    new.raw_app_meta_data ->> 'vorname',
    coalesce(new.raw_app_meta_data ->> 'nachname', ''),
    coalesce((new.raw_app_meta_data ->> 'rolle')::public.app_rolle, 'mitarbeiter'),
    nullif(trim(new.raw_app_meta_data ->> 'kontakt_email'), ''),
    nullif(trim(new.raw_app_meta_data ->> 'telefon'), ''),
    coalesce((new.raw_app_meta_data ->> 'muss_passwort_aendern')::boolean, true)
  );
  return new;
end;
$$;

create trigger auth_nutzer_angelegt
  after insert on auth.users
  for each row execute function public.neuer_auth_nutzer();


-- -----------------------------------------------------------------------------
-- Admin-Funktion: alle Sessions eines Nutzers beenden (Refresh-Tokens weg).
-- Wird beim Deaktivieren vom Server mit Secret Key aufgerufen.
-- -----------------------------------------------------------------------------
create function public.nutzer_sessions_beenden(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;


-- -----------------------------------------------------------------------------
-- Rechte auf Funktionen
-- Supabase/Postgres geben neuen Funktionen standardmäßig EXECUTE für alle.
-- -----------------------------------------------------------------------------
-- RLS-Hilfsfunktionen: nur eingeloggte Nutzer
revoke execute on function public.ist_aktiv()                from public, anon;
revoke execute on function public.ist_admin()                from public, anon;
revoke execute on function public.ist_buero_oder_admin()     from public, anon;
revoke execute on function public.ist_projektmitglied(uuid)  from public, anon;
grant  execute on function public.ist_aktiv()                to authenticated;
grant  execute on function public.ist_admin()                to authenticated;
grant  execute on function public.ist_buero_oder_admin()     to authenticated;
grant  execute on function public.ist_projektmitglied(uuid)  to authenticated;

-- Trigger-Funktionen: niemand direkt
revoke execute on function public.setze_updated_at()         from public, anon, authenticated;
revoke execute on function public.protokolliere_aenderung()  from public, anon, authenticated;
revoke execute on function public.schuetze_admins()          from public, anon, authenticated;
revoke execute on function public.neuer_auth_nutzer()        from public, anon, authenticated;

-- Admin-Funktionen: nur service_role (Server mit Secret Key)
revoke execute on function public.nutzer_sessions_beenden(uuid) from public, anon, authenticated;
grant  execute on function public.nutzer_sessions_beenden(uuid) to service_role;


-- -----------------------------------------------------------------------------
-- Tabellenrechte: TRUNCATE wird nicht von RLS erfasst → entziehen.
-- audit_log darf niemand direkt schreiben.
-- -----------------------------------------------------------------------------
revoke truncate on public.profiles, public.project_statuses, public.contacts,
  public.projects, public.project_members, public.vehicles, public.audit_log
  from anon, authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated;


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.project_statuses  enable row level security;
alter table public.contacts          enable row level security;
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.vehicles          enable row level security;
alter table public.audit_log         enable row level security;

-- profiles: eigenes Profil (wenn aktiv) oder Büro/Admin sieht alle.
-- Ändern nur Admin. Anlegen nur über den Trigger, löschen nie.
create policy profiles_lesen on public.profiles
  for select to authenticated
  using (
    (id = (select auth.uid()) and (select public.ist_aktiv()))
    or (select public.ist_buero_oder_admin())
  );

create policy profiles_aendern on public.profiles
  for update to authenticated
  using ((select public.ist_admin()))
  with check ((select public.ist_admin()));

-- project_statuses: alle aktiven Nutzer lesen, nur Admin verwaltet (Einstellungen)
create policy project_statuses_lesen on public.project_statuses
  for select to authenticated
  using ((select public.ist_aktiv()));

create policy project_statuses_anlegen on public.project_statuses
  for insert to authenticated
  with check ((select public.ist_admin()));

create policy project_statuses_aendern on public.project_statuses
  for update to authenticated
  using ((select public.ist_admin()))
  with check ((select public.ist_admin()));

-- contacts: Büro/Admin alles (außer löschen), Mitarbeiter nur Kunden ihrer Projekte
create policy contacts_lesen on public.contacts
  for select to authenticated
  using (
    (select public.ist_buero_oder_admin())
    or exists (
      select 1 from public.projects p
      where p.contact_id = contacts.id
        and public.ist_projektmitglied(p.id)
    )
  );

create policy contacts_anlegen on public.contacts
  for insert to authenticated
  with check ((select public.ist_buero_oder_admin()));

create policy contacts_aendern on public.contacts
  for update to authenticated
  using ((select public.ist_buero_oder_admin()))
  with check ((select public.ist_buero_oder_admin()));

-- projects: Büro/Admin alles (außer löschen), Mitarbeiter nur eigene Projekte lesen
create policy projects_lesen on public.projects
  for select to authenticated
  using (
    (select public.ist_buero_oder_admin())
    or public.ist_projektmitglied(id)
  );

create policy projects_anlegen on public.projects
  for insert to authenticated
  with check ((select public.ist_buero_oder_admin()));

create policy projects_aendern on public.projects
  for update to authenticated
  using ((select public.ist_buero_oder_admin()))
  with check ((select public.ist_buero_oder_admin()));

-- project_members: Büro/Admin verwalten, Mitarbeiter sehen die Mitglieder
-- ihrer eigenen Projekte. (Kollegen hinzufügen durch Mitarbeiter: Phase 1)
create policy project_members_lesen on public.project_members
  for select to authenticated
  using (
    (select public.ist_buero_oder_admin())
    or public.ist_projektmitglied(project_id)
  );

create policy project_members_anlegen on public.project_members
  for insert to authenticated
  with check (
    (select public.ist_buero_oder_admin())
    and added_by = (select auth.uid())
  );

create policy project_members_entfernen on public.project_members
  for delete to authenticated
  using ((select public.ist_buero_oder_admin()));

-- vehicles: alle aktiven Nutzer lesen, nur Admin verwaltet (Einstellungen)
create policy vehicles_lesen on public.vehicles
  for select to authenticated
  using ((select public.ist_aktiv()));

create policy vehicles_anlegen on public.vehicles
  for insert to authenticated
  with check ((select public.ist_admin()));

create policy vehicles_aendern on public.vehicles
  for update to authenticated
  using ((select public.ist_admin()))
  with check ((select public.ist_admin()));

-- audit_log: nur Büro/Admin lesen
create policy audit_log_lesen on public.audit_log
  for select to authenticated
  using ((select public.ist_buero_oder_admin()));
