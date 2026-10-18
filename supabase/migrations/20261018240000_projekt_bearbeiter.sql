-- Projektliste wie in Plancraft (Mika, 18.10.2026): Spalte „Bearbeitet“ zeigt Zeitpunkt UND wer zuletzt etwas am Projekt geändert hat.
-- Die Datenbank trägt den eingeloggten Nutzer bei jedem Anlegen/Ändern selbst ein (nicht von der App vorgebbar).

alter table public.projects add column bearbeitet_von uuid references public.profiles (id);

create function public.projekt_bearbeiter_festhalten()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.bearbeitet_von := auth.uid();
  return new;
end;
$$;

create trigger projects_bearbeiter before insert or update on public.projects
  for each row execute function public.projekt_bearbeiter_festhalten();
revoke execute on function public.projekt_bearbeiter_festhalten() from public, anon, authenticated;
