-- Container melden (Mika, 20.10.2026): Jeder Mitarbeiter kann „Papiercontainer“ oder „Restmüllcontainer“ melden (z. B. wenn er voll ist).
-- Ist ein Container gemeldet, gilt für ALLE Mitarbeiter 7 Tage Sperre für genau diese Art (die andere Art bleibt frei).
-- Das Büro bekommt einen Hinweis (Benachrichtigung + Übersicht), markiert „erledigt/bestellt“ und kann die Sperre vorzeitig aufheben.
-- Nichts wird gelöscht. Später kann Jarvis (API) die Bestellung übernehmen und den Eintrag auf erledigt setzen.

create table public.container_requests (
  id              uuid primary key default gen_random_uuid(),
  art             text not null check (art in ('papier', 'restmuell')),
  ausgeloest_von  uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  erledigt_am     timestamptz,
  erledigt_von    uuid references public.profiles (id),
  notiz           text check (length(notiz) <= 300),
  freigegeben_am  timestamptz,
  freigegeben_von uuid references public.profiles (id)
);
create index container_requests_art_idx on public.container_requests (art, created_at desc);

-- Sperre: Pro Art höchstens eine Meldung in 7 Tagen (außer das Büro hat die Sperre aufgehoben).
-- Der Sperrbereich wird pro Art gesperrt, damit zwei gleichzeitige Tipps nicht beide durchkommen.
create function public.container_sperre()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_letzte timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('container_' || new.art));
  select max(created_at) into v_letzte
  from public.container_requests
  where art = new.art and freigegeben_am is null and created_at > now() - interval '7 days';
  if v_letzte is not null then
    raise exception 'Dieser Container wurde schon gemeldet. Erst am % wieder möglich.', to_char((v_letzte + interval '7 days') at time zone 'Europe/Berlin', 'DD.MM.YYYY')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger container_requests_sperre before insert on public.container_requests
  for each row execute function public.container_sperre();

-- Art, Melder und Zeitpunkt ändern sich nie; Bearbeiter der Erledigung setzt die Datenbank
create function public.container_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.art := old.art;
  new.ausgeloest_von := old.ausgeloest_von;
  new.created_at := old.created_at;
  if new.erledigt_am is not null and old.erledigt_am is null then new.erledigt_von := coalesce((select auth.uid()), new.erledigt_von); end if;
  if new.freigegeben_am is not null and old.freigegeben_am is null then new.freigegeben_von := coalesce((select auth.uid()), new.freigegeben_von); end if;
  return new;
end;
$$;
create trigger container_requests_schuetzen before update on public.container_requests
  for each row execute function public.container_schuetzen();

-- Hinweis fürs Büro
create function public.benachrichtige_container()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wer text;
begin
  select trim(vorname || ' ' || nachname) into v_wer from public.profiles where id = new.ausgeloest_von;
  insert into public.notifications (typ, text, ausgeloest_von)
  values (
    'container',
    format('%s hat den %s gemeldet.', coalesce(nullif(v_wer, ''), 'Jemand'), case new.art when 'papier' then 'Papiercontainer' else 'Restmüllcontainer' end),
    new.ausgeloest_von
  );
  return null;
end;
$$;
create trigger container_requests_benachrichtigen after insert on public.container_requests
  for each row execute function public.benachrichtige_container();

create trigger container_requests_audit after insert or update or delete on public.container_requests
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.container_sperre()          from public, anon, authenticated;
revoke execute on function public.container_schuetzen()       from public, anon, authenticated;
revoke execute on function public.benachrichtige_container()  from public, anon, authenticated;

alter table public.container_requests enable row level security;
revoke truncate on public.container_requests from anon, authenticated;

-- Alle aktiven Nutzer sehen den Stand (für „gesperrt bis …“) und melden; nur Büro/Admin ändern (erledigt, Sperre aufheben). Kein DELETE.
create policy container_lesen on public.container_requests for select to authenticated
  using ((select public.ist_aktiv()));
create policy container_melden on public.container_requests for insert to authenticated
  with check ((select public.ist_aktiv()) and ausgeloest_von = (select auth.uid()) and erledigt_am is null and freigegeben_am is null);
create policy container_aendern on public.container_requests for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
