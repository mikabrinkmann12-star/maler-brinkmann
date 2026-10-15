-- =============================================================================
-- Korrektur zu 20261015180000_grundgeruest
--
-- Supabase Auth schreibt app_metadata erst NACH dem INSERT in auth.users.
-- Der alte Trigger fand dort deshalb noch keinen Benutzernamen und brach ab.
--
-- Neu: Das Profil entsteht beim Anlegen nur mit sicheren Standardwerten
--   * benutzername = Teil der Login-Adresse vor dem @
--   * rolle        = mitarbeiter (Standard der Spalte, geringste Rechte)
--   * muss_passwort_aendern = true (Standard der Spalte)
-- Name, Rolle, Telefon usw. setzt danach der Server (Secret Key) direkt in
-- profiles (src/lib/nutzer.ts). app_metadata und user_metadata werden damit
-- überhaupt nicht mehr gelesen.
-- =============================================================================

create or replace function public.neuer_auth_nutzer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_benutzername text := lower(split_part(new.email, '@', 1));
begin
  -- Vorname vorläufig = Benutzername, wird direkt danach vom Server gesetzt.
  insert into public.profiles (id, benutzername, vorname)
  values (new.id, v_benutzername, v_benutzername);
  return new;
end;
$$;

revoke execute on function public.neuer_auth_nutzer() from public, anon, authenticated;
