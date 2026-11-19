-- Website-Anfragen (Mika, 19.11.2026): Das Kontaktformular der Firmen-Website (maler-brinkmann.de) schickt jede Anfrage über
-- `anfrage.php` (Strato) an den Webhook `/api/anfragen` der App. Hier steht die Liste für das Büro: neu / angenommen / abgelehnt.
-- „Annehmen“ legt einen Kontakt an (oder verknüpft einen vorhandenen) und setzt den Status in EINEM Schritt (Funktion
-- `anfrage_annehmen`), damit kein halber Zustand entsteht. Nichts wird gelöscht (Ablehnen = Status, archivieren über `archiviert_am`).
-- Rechte wie bei den Anrufen: Büro/Admin mit dem Recht „buero_zugang“ lesen und ändern; eintragen nur der Webhook (Dienst-Client).

create table public.website_anfragen (
  -- ID erzeugt der Browser auf der Website; ein zweites Senden derselben Anfrage legt nichts doppelt an (on conflict do nothing)
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 200),
  vorname         text check (length(vorname) <= 80),
  nachname        text check (length(nachname) <= 80),
  telefon         text check (length(telefon) <= 40),
  email           text check (length(email) <= 200),
  betreff         text not null default '' check (length(betreff) <= 200),
  nachricht       text not null check (length(btrim(nachricht)) between 1 and 10000),
  strasse         text check (length(strasse) <= 120),
  plz             text check (length(plz) <= 10),
  ort             text check (length(ort) <= 80),
  quelle          text not null default 'website' check (quelle ~ '^[a-z0-9_-]{1,40}$'),
  status          text not null default 'neu' check (status in ('neu', 'angenommen', 'abgelehnt')),
  notiz           text check (length(notiz) <= 1000),
  contact_id      uuid references public.contacts (id),
  bearbeitet_von  uuid references public.profiles (id) on delete set null,
  archiviert_am   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Ohne Telefon oder E-Mail kann niemand zurückrufen
  constraint website_anfragen_erreichbar check (nullif(btrim(telefon), '') is not null or nullif(btrim(email), '') is not null),
  -- „Angenommen“ heißt immer: ein Kontakt hängt daran
  constraint website_anfragen_angenommen_mit_kontakt check (status <> 'angenommen' or contact_id is not null)
);
create index website_anfragen_created_idx on public.website_anfragen (created_at desc);
create index website_anfragen_status_idx on public.website_anfragen (status) where archiviert_am is null;
create index website_anfragen_contact_idx on public.website_anfragen (contact_id);

-- Was der Kunde geschickt hat (Herkunft, Inhalt, Zeitpunkt) ändert sich nie; Bearbeiter setzt die Datenbank
create function public.website_anfrage_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.name := old.name;
  new.vorname := old.vorname;
  new.nachname := old.nachname;
  new.telefon := old.telefon;
  new.email := old.email;
  new.betreff := old.betreff;
  new.nachricht := old.nachricht;
  new.strasse := old.strasse;
  new.plz := old.plz;
  new.ort := old.ort;
  new.quelle := old.quelle;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- Wer eingeloggt ändert, steht als Bearbeiter; ohne Login (Dienst, Aufräumen) bleibt, was mitgegeben wurde
  new.bearbeitet_von := coalesce((select auth.uid()), new.bearbeitet_von);
  return new;
end;
$$;
create trigger website_anfragen_schuetzen before update on public.website_anfragen
  for each row execute function public.website_anfrage_schuetzen();

-- Hinweis fürs Büro (Glocke) bei jeder neuen Anfrage
create function public.benachrichtige_website_anfrage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (typ, text)
  values ('anfrage', format('Neue Website-Anfrage von %s: %s', left(btrim(new.name), 80),
    left(coalesce(nullif(btrim(new.betreff), ''), 'ohne Betreff'), 140)));
  return null;
end;
$$;
create trigger website_anfragen_benachrichtigen after insert on public.website_anfragen
  for each row execute function public.benachrichtige_website_anfrage();

create trigger website_anfragen_audit after insert or update or delete on public.website_anfragen
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.website_anfrage_schuetzen()       from public, anon, authenticated;
revoke execute on function public.benachrichtige_website_anfrage()  from public, anon, authenticated;

alter table public.website_anfragen enable row level security;
-- Eintragen nur der Webhook (Dienst-Client), löschen niemand
revoke all on public.website_anfragen from anon;
revoke insert, delete, truncate on public.website_anfragen from authenticated;

-- Büro/Admin mit dem Recht „buero_zugang“ lesen und ändern. Kein INSERT, kein DELETE.
create policy website_anfragen_lesen on public.website_anfragen for select to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')));
create policy website_anfragen_aendern on public.website_anfragen for update to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')))
  with check ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')));

-- Annehmen: Kontakt anlegen (p_kontakt) ODER vorhandenen verknüpfen (p_contact_id), dann Status „angenommen“, alles in einer
-- Transaktion. Läuft mit den Rechten des Aufrufers (security invoker): RLS von contacts (kontakte_bearbeiten) und
-- website_anfragen (buero_zugang) gilt ganz normal. Die Zeile wird gesperrt; ist sie schon angenommen (Doppelklick, zweiter Tab),
-- kommt der schon verknüpfte Kontakt zurück und es wird nichts doppelt angelegt.
create function public.anfrage_annehmen(p_id uuid, p_contact_id uuid default null, p_kontakt jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_kontakt uuid;
  t text;
begin
  if not ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang'))) then
    raise exception 'Keine Berechtigung.' using errcode = '42501';
  end if;
  if (p_contact_id is null) = (p_kontakt is null) then
    raise exception 'Entweder einen vorhandenen Kontakt oder neue Kontaktdaten angeben.' using errcode = '22023';
  end if;

  select a.status, a.contact_id into v_status, v_kontakt
  from public.website_anfragen a where a.id = p_id for update;
  if not found then
    raise exception 'Anfrage nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_status = 'angenommen' then
    return v_kontakt;
  end if;

  if p_contact_id is not null then
    select c.id into v_kontakt from public.contacts c where c.id = p_contact_id;
    if not found then
      raise exception 'Kontakt nicht gefunden.' using errcode = 'P0002';
    end if;
  else
    if jsonb_typeof(p_kontakt) <> 'object' then
      raise exception 'Ungültige Kontaktdaten.' using errcode = '22023';
    end if;
    t := coalesce(nullif(btrim(p_kontakt ->> 'nachname'), ''), '');
    if t = '' then
      raise exception 'Bitte einen Nachnamen eingeben.' using errcode = '22023';
    end if;
    insert into public.contacts (kundennummer, typ, anrede, vorname, nachname, strasse, plz, ort, telefon, email, notizen)
    values (
      nullif(btrim(p_kontakt ->> 'kundennummer'), ''),
      'privat'::public.kontakt_typ,
      nullif(btrim(p_kontakt ->> 'anrede'), ''),
      nullif(btrim(p_kontakt ->> 'vorname'), ''),
      nullif(btrim(p_kontakt ->> 'nachname'), ''),
      nullif(btrim(p_kontakt ->> 'strasse'), ''),
      nullif(btrim(p_kontakt ->> 'plz'), ''),
      nullif(btrim(p_kontakt ->> 'ort'), ''),
      nullif(btrim(p_kontakt ->> 'telefon'), ''),
      nullif(btrim(p_kontakt ->> 'email'), ''),
      nullif(btrim(p_kontakt ->> 'notizen'), '')
    )
    returning id into v_kontakt;
  end if;

  update public.website_anfragen set status = 'angenommen', contact_id = v_kontakt where id = p_id;
  return v_kontakt;
end;
$$;
revoke execute on function public.anfrage_annehmen(uuid, uuid, jsonb) from public, anon;
grant execute on function public.anfrage_annehmen(uuid, uuid, jsonb) to authenticated;
