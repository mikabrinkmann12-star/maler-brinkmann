-- =============================================================================
-- Überstundenabbau (Abfeiern) als Urlaubsantrag + bessere automatische Buchung
-- (Entscheidungen mit Mika, 16.10.2026) – Teil 2 von 2
--
-- 1. Ein Urlaubsantrag kann die Art „ueberstundenabbau“ haben (Unterkategorie
--    von Urlaub: verbraucht keinen Urlaubsanspruch, senkt das Überstundenkonto).
-- 2. Feiertage Niedersachsen als SQL-Funktion (gleiche Regel wie
--    src/lib/feiertage.ts).
-- 3. Persönliches Soll eines Tages (Teilzeit, Feiertag, Wochenende).
-- 4. Die automatische Buchung genehmigter Anträge bucht jetzt das persönliche
--    Soll und überspringt Wochenenden, Feiertage und freie Tage. Bereits
--    gebuchte Einträge bleiben unverändert.
-- 5. Der Hinweis fürs Büro nennt die neue Art.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Neue Art im Urlaubsantrag
-- -----------------------------------------------------------------------------
alter table public.leave_requests drop constraint leave_requests_art_check;
alter table public.leave_requests
  add constraint leave_requests_art_check
  check (art in ('urlaub', 'unbezahlter_urlaub', 'ueberstundenabbau'));


-- -----------------------------------------------------------------------------
-- 2. Feiertage Niedersachsen
--    Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag,
--    3. Oktober, Reformationstag (31.10.), 1. und 2. Weihnachtstag.
-- -----------------------------------------------------------------------------
create function public.ostersonntag(p_jahr integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a integer; b integer; c integer; d integer; e integer; f integer; g integer;
  h integer; i integer; k integer; l integer; m integer;
  v_monat integer; v_tag integer;
begin
  -- Gaußsche Osterformel (gregorianischer Kalender)
  a := p_jahr % 19;
  b := p_jahr / 100;
  c := p_jahr % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  v_monat := (h + l - 7 * m + 114) / 31;
  v_tag := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_jahr, v_monat, v_tag);
end;
$$;

create function public.ist_feiertag_ni(p_tag date)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_jahr integer := extract(year from p_tag)::integer;
  v_ostern date := public.ostersonntag(extract(year from p_tag)::integer);
begin
  return p_tag in (
    make_date(v_jahr, 1, 1),
    v_ostern - 2,           -- Karfreitag
    v_ostern + 1,           -- Ostermontag
    make_date(v_jahr, 5, 1),
    v_ostern + 39,          -- Christi Himmelfahrt
    v_ostern + 50,          -- Pfingstmontag
    make_date(v_jahr, 10, 3),
    make_date(v_jahr, 10, 31),
    make_date(v_jahr, 12, 25),
    make_date(v_jahr, 12, 26)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Persönliches Soll eines Tages in Stunden
--    Wochenende und Feiertage: 0. Sonst das Feld der Person (profiles.soll_*),
--    ist es leer, der Standard aus den Einstellungen „Zeiterfassung“.
-- -----------------------------------------------------------------------------
create function public.soll_stunden(p_user uuid, p_tag date)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_wochentag integer := extract(isodow from p_tag)::integer;
  v_soll      numeric;
  v_e         jsonb;
  v_beginn    time;
  v_ende      time;
  v_pause     integer;
begin
  if v_wochentag > 5 or public.ist_feiertag_ni(p_tag) then
    return 0;
  end if;

  select case v_wochentag
           when 1 then soll_mo when 2 then soll_di when 3 then soll_mi
           when 4 then soll_do else soll_fr
         end
    into v_soll
    from public.profiles where id = p_user;
  if v_soll is not null then
    return v_soll;
  end if;

  select wert into v_e from public.app_settings where schluessel = 'zeiterfassung';
  v_beginn := coalesce(v_e ->> 'standard_beginn', '06:30')::time;
  if v_wochentag = 5 then
    v_ende  := coalesce(v_e ->> 'freitag_ende', '12:45')::time;
    v_pause := coalesce((v_e ->> 'freitag_pause_min')::integer, 15);
  else
    v_ende  := coalesce(v_e ->> 'standard_ende', '15:45')::time;
    v_pause := coalesce((v_e ->> 'standard_pause_min')::integer, 45);
  end if;
  return greatest(0, round((extract(epoch from (v_ende - v_beginn)) / 60 - v_pause) / 60, 2));
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Automatische Buchung genehmigter Anträge (ersetzt die Funktion aus …140000)
-- -----------------------------------------------------------------------------
create or replace function public.urlaub_zeiten_buchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag      date;
  v_stunden  numeric;
  v_text     text;
begin
  if new.status = 'genehmigt' and old.status is distinct from 'genehmigt' then
    v_text := case new.art
      when 'ueberstundenabbau' then 'Automatisch aus genehmigtem Überstundenabbau'
      else 'Automatisch aus genehmigtem Urlaubsantrag'
    end;

    for v_tag in select g::date from generate_series(new.von, new.bis, interval '1 day') g loop
      v_stunden := public.soll_stunden(new.user_id, v_tag);
      continue when v_stunden <= 0;  -- Wochenende, Feiertag oder freier Tag

      insert into public.time_entries
        (user_id, datum, art, stunden, beschreibung, erstellt_von, leave_request_id)
      values (
        new.user_id, v_tag, new.art, v_stunden, v_text,
        coalesce((select auth.uid()), new.entschieden_von),
        new.id
      );
    end loop;

  elsif old.status = 'genehmigt' and new.status is distinct from 'genehmigt' then
    update public.time_entries
      set archiviert_am = now()
      where leave_request_id = new.id and archiviert_am is null;
  end if;
  return null;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Hinweis fürs Büro (ersetzt die Funktion aus …200000, nur der Text ändert sich)
-- -----------------------------------------------------------------------------
create or replace function public.benachrichtige_buero()
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
        case new.art
          when 'urlaub' then 'Urlaub'
          when 'ueberstundenabbau' then 'Überstunden abfeiern'
          else 'unbezahlten Urlaub'
        end,
        to_char(new.von, 'DD.MM.YYYY'), to_char(new.bis, 'DD.MM.YYYY')),
      new.user_id
    from public.profiles p where p.id = new.user_id;
  end if;
  return null;
end;
$$;


-- -----------------------------------------------------------------------------
-- Rechte
--   Feiertags-Funktionen: reine Rechenfunktionen, für Eingeloggte nutzbar.
--   soll_stunden: nur intern (Trigger) und für service_role (Admin/Tests).
-- -----------------------------------------------------------------------------
revoke execute on function public.ostersonntag(integer)         from public, anon;
revoke execute on function public.ist_feiertag_ni(date)         from public, anon;
grant  execute on function public.ostersonntag(integer)         to authenticated;
grant  execute on function public.ist_feiertag_ni(date)         to authenticated;

revoke execute on function public.soll_stunden(uuid, date)      from public, anon, authenticated;
grant  execute on function public.soll_stunden(uuid, date)      to service_role;
