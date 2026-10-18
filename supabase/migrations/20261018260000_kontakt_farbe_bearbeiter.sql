-- Kontaktliste wie in Plancraft (Mika, 18.10.2026): Farbe je Kontakt (6 Farbpunkte) und „Bearbeitet von“.
-- Wie bei den Projekten trägt die Datenbank den eingeloggten Nutzer bei jedem Anlegen/Ändern selbst ein.

alter table public.contacts
  add column farbe text check (farbe in ('rot', 'orange', 'gruen', 'blau', 'lila', 'grau')),
  add column bearbeitet_von uuid references public.profiles (id);

create function public.kontakt_bearbeiter_festhalten()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.bearbeitet_von := auth.uid();
  return new;
end;
$$;

create trigger contacts_bearbeiter before insert or update on public.contacts
  for each row execute function public.kontakt_bearbeiter_festhalten();
revoke execute on function public.kontakt_bearbeiter_festhalten() from public, anon, authenticated;
