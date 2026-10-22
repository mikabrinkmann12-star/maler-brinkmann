-- Anrufe (Mika, 22.10.2026, wie „Anrufe“ / KI-Telefon bei Plancraft): Ein Telefon-KI-Dienst nimmt Anrufe an und schickt das Ergebnis
-- (Zusammenfassung, Kategorie, Text) an die App. Hier steht die Liste für das Büro: Status neu / in Bearbeitung / erledigt, Notiz,
-- Verknüpfung mit einem Kontakt (über die Rufnummer). Eingetragen wird vom Webhook (`/api/anrufe`, Dienst-Client) oder von Hand vom Büro.
-- Nichts wird gelöscht (archivieren). Rechte: Büro/Admin mit dem Recht „buero_zugang“ (Hinweise und Verlauf im Büro).

create table public.calls (
  id               uuid primary key default gen_random_uuid(),
  anbieter         text not null check (anbieter in ('manuell', 'generisch', 'retell')),
  -- ID des Anrufs beim Anbieter, damit ein zweites Senden nichts doppelt anlegt
  anbieter_id      text check (length(anbieter_id) <= 200),
  richtung         text not null default 'eingehend' check (richtung in ('eingehend', 'ausgehend')),
  von_nummer       text check (length(von_nummer) <= 40),
  an_nummer        text check (length(an_nummer) <= 40),
  contact_id       uuid references public.contacts (id),
  beginn           timestamptz not null default now(),
  dauer_sek        integer check (dauer_sek is null or (dauer_sek >= 0 and dauer_sek <= 86400)),
  zusammenfassung  text not null default '' check (length(zusammenfassung) <= 4000),
  transkript       text check (length(transkript) <= 60000),
  kategorie        text not null default 'sonstiges' check (kategorie in ('anfrage', 'information', 'spam', 'sonstiges')),
  status           text not null default 'neu' check (status in ('neu', 'in_bearbeitung', 'erledigt')),
  notiz            text check (length(notiz) <= 1000),
  erstellt_von     uuid references public.profiles (id) default auth.uid(),
  bearbeitet_von   uuid references public.profiles (id),
  archiviert_am    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index calls_anbieter_id_idx on public.calls (anbieter, anbieter_id) where anbieter_id is not null;
create index calls_beginn_idx on public.calls (beginn desc);
create index calls_status_idx on public.calls (status) where archiviert_am is null;
create index calls_contact_idx on public.calls (contact_id);

-- Herkunft, Anbieter-ID und Zeitpunkt ändern sich nie; Bearbeiter setzt die Datenbank
create function public.anruf_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anbieter := old.anbieter;
  new.anbieter_id := old.anbieter_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.bearbeitet_von := coalesce((select auth.uid()), old.bearbeitet_von);
  return new;
end;
$$;
create trigger calls_schuetzen before update on public.calls
  for each row execute function public.anruf_schuetzen();

-- Hinweis fürs Büro (Glocke), nur bei neuen eingehenden Anrufen ohne Spam
create function public.benachrichtige_anruf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.richtung = 'eingehend' and new.kategorie <> 'spam' then
    insert into public.notifications (typ, text)
    values ('anruf', format('Neuer Anruf%s: %s', case when new.von_nummer is not null then ' von ' || new.von_nummer else '' end,
      left(coalesce(nullif(new.zusammenfassung, ''), 'ohne Zusammenfassung'), 140)));
  end if;
  return null;
end;
$$;
create trigger calls_benachrichtigen after insert on public.calls
  for each row execute function public.benachrichtige_anruf();

create trigger calls_audit after insert or update or delete on public.calls
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.anruf_schuetzen()        from public, anon, authenticated;
revoke execute on function public.benachrichtige_anruf()   from public, anon, authenticated;

alter table public.calls enable row level security;
revoke truncate on public.calls from anon, authenticated;

-- Büro/Admin mit dem Recht „buero_zugang“ lesen, tragen von Hand ein (nur „manuell“) und ändern. Kein DELETE.
create policy anrufe_lesen on public.calls for select to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')));
create policy anrufe_eintragen on public.calls for insert to authenticated
  with check ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')) and anbieter = 'manuell' and erstellt_von = (select auth.uid()));
create policy anrufe_aendern on public.calls for update to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')))
  with check ((select public.ist_buero_oder_admin()) and (select public.recht_ok('buero_zugang')));
