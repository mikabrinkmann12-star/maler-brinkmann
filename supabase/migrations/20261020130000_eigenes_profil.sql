-- Mitarbeiter-App: Jeder darf sein eigenes Profil (Name, Mobilnummer) und seine
-- Benachrichtigungs-Wünsche ändern. Die Tabelle profiles bleibt per RLS nur für
-- den Admin änderbar; diese zwei Funktionen ändern gezielt NUR diese Felder
-- und NUR die Zeile des Aufrufers (auth.uid()). Rolle, aktiv usw. sind tabu.

alter table public.profiles
  add column benachrichtigungen jsonb not null default '{}'::jsonb;

comment on column public.profiles.benachrichtigungen is
  'Wünsche für Benachrichtigungen (Schalter in der Mitarbeiter-App). Push folgt später.';

create function public.eigenes_profil_speichern(
  p_vorname text,
  p_nachname text,
  p_telefon text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if char_length(btrim(coalesce(p_vorname, ''))) not between 1 and 50 then
    raise exception 'Bitte einen Vornamen eingeben (höchstens 50 Zeichen).' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_nachname, ''))) > 50 then
    raise exception 'Der Nachname ist zu lang.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_telefon, ''))) > 30 then
    raise exception 'Die Telefonnummer ist zu lang.' using errcode = 'P0001';
  end if;

  update public.profiles
     set vorname = btrim(p_vorname),
         nachname = btrim(coalesce(p_nachname, '')),
         telefon = nullif(btrim(coalesce(p_telefon, '')), '')
   where id = (select auth.uid())
     and aktiv;
  get diagnostics v_anzahl = row_count;
  if v_anzahl = 0 then
    raise exception 'Das Profil konnte nicht gespeichert werden.' using errcode = 'P0001';
  end if;
end;
$$;

create function public.eigene_benachrichtigungen_speichern(p_wert jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anzahl integer;
begin
  if p_wert is null or jsonb_typeof(p_wert) <> 'object' or pg_column_size(p_wert) > 1000 then
    raise exception 'Ungültige Eingabe.' using errcode = 'P0001';
  end if;

  update public.profiles
     set benachrichtigungen = p_wert
   where id = (select auth.uid())
     and aktiv;
  get diagnostics v_anzahl = row_count;
  if v_anzahl = 0 then
    raise exception 'Die Einstellung konnte nicht gespeichert werden.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.eigenes_profil_speichern(text, text, text) from public, anon;
grant execute on function public.eigenes_profil_speichern(text, text, text) to authenticated;
revoke execute on function public.eigene_benachrichtigungen_speichern(jsonb) from public, anon;
grant execute on function public.eigene_benachrichtigungen_speichern(jsonb) to authenticated;
