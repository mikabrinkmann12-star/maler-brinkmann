-- =============================================================================
-- Entscheidungen mit Mika vom 16.10.2026
--
-- 1. Urlaubsanspruch pro Mitarbeiter (Tage pro Kalenderjahr, kein Übertrag).
-- 2. Zeiten derselben Person dürfen sich nie überschneiden – egal, wer sie
--    einträgt. Direkter Anschluss (6:30–7:45 und 7:45–15:45) ist erlaubt.
-- 3. Genehmigter Urlaub wird automatisch als Zeit gebucht (je Werktag die
--    Standardstunden: Mo–Do 6:30–15:45 − 45 Min, Fr 6:30–12:45 − 15 Min).
--    Wird die Genehmigung zurückgenommen, werden diese Einträge archiviert.
-- 4. Freitag hat eigene Standardzeiten (Einstellung „Zeiterfassung“).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Urlaubsanspruch
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column urlaubstage_jahr integer check (urlaubstage_jahr between 0 and 60);

comment on column public.profiles.urlaubstage_jahr is
  'Urlaubsanspruch in Werktagen pro Kalenderjahr (ohne Übertrag). Pflegt der Admin.';


-- -----------------------------------------------------------------------------
-- 2. Keine überschneidenden Zeiten derselben Person
-- -----------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

-- Zeitspanne in Minuten seit Mitternacht, halboffen [von, bis): 7:45 darf
-- gleichzeitig Ende des einen und Beginn des nächsten Eintrags sein.
alter table public.time_entries
  add constraint time_entries_keine_ueberschneidung
  exclude using gist (
    user_id with =,
    datum with =,
    int4range(
      (extract(epoch from von) / 60)::integer,
      (extract(epoch from bis) / 60)::integer
    ) with &&
  )
  where (archiviert_am is null and von is not null and bis is not null);


-- -----------------------------------------------------------------------------
-- 3. Genehmigter Urlaub → Zeiteinträge
-- -----------------------------------------------------------------------------
alter table public.time_entries
  add column leave_request_id uuid references public.leave_requests (id);
create index time_entries_leave_request_idx on public.time_entries (leave_request_id);

-- Nur der Admin (bzw. die Genehmigung) darf Zeiten mit einem Urlaubsantrag verknüpfen.
create function public.zeit_urlaub_schutz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.leave_request_id is distinct from (case when tg_op = 'UPDATE' then old.leave_request_id end)
     and (select auth.uid()) is not null and not public.ist_admin() then
    raise exception 'Urlaubs-Buchungen legt nur die Genehmigung an.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger time_entries_urlaub_schutz
  before insert or update of leave_request_id on public.time_entries
  for each row execute function public.zeit_urlaub_schutz();

create function public.urlaub_zeiten_buchen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e       jsonb;
  v_tag     date;
  v_beginn  time;
  v_ende    time;
  v_pause   integer;
begin
  if new.status = 'genehmigt' and old.status is distinct from 'genehmigt' then
    select wert into v_e from public.app_settings where schluessel = 'zeiterfassung';
    v_beginn := coalesce(v_e ->> 'standard_beginn', '06:30')::time;

    for v_tag in select g::date from generate_series(new.von, new.bis, interval '1 day') g loop
      continue when extract(isodow from v_tag) > 5;  -- Samstag, Sonntag
      if extract(isodow from v_tag) = 5 then
        v_ende  := coalesce(v_e ->> 'freitag_ende', '12:45')::time;
        v_pause := coalesce((v_e ->> 'freitag_pause_min')::integer, 15);
      else
        v_ende  := coalesce(v_e ->> 'standard_ende', '15:45')::time;
        v_pause := coalesce((v_e ->> 'standard_pause_min')::integer, 45);
      end if;

      insert into public.time_entries
        (user_id, datum, art, stunden, beschreibung, erstellt_von, leave_request_id)
      values (
        new.user_id, v_tag, new.art,
        greatest(0, round((extract(epoch from (v_ende - v_beginn)) / 60 - v_pause) / 60, 2)),
        'Automatisch aus genehmigtem Urlaubsantrag',
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

create trigger leave_requests_zeiten_buchen
  after update of status on public.leave_requests
  for each row execute function public.urlaub_zeiten_buchen();

revoke execute on function public.zeit_urlaub_schutz()     from public, anon, authenticated;
revoke execute on function public.urlaub_zeiten_buchen()   from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. Freitag: eigene Standardzeiten (bestehende Einstellung ergänzen)
-- -----------------------------------------------------------------------------
update public.app_settings
  set wert = wert || jsonb_build_object('freitag_ende', '12:45', 'freitag_pause_min', 15)
  where schluessel = 'zeiterfassung' and not (wert ? 'freitag_ende');
