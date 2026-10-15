-- =============================================================================
-- Korrektur zu 20261015200000_phase1_mitarbeiter_app
--
-- Wer eine Zeit für einen Kollegen einträgt, soll diesen Eintrag auch sehen
-- (z. B. der Vorarbeiter die Zeiten seiner Kolonne). Ändern darf ihn weiterhin
-- nur der Betroffene selbst (innerhalb der Sperrfrist) oder das Büro.
-- =============================================================================

drop policy time_entries_lesen on public.time_entries;

create policy time_entries_lesen on public.time_entries
  for select to authenticated
  using (
    ((user_id = (select auth.uid()) or erstellt_von = (select auth.uid()))
      and (select public.ist_aktiv()))
    or (select public.ist_buero_oder_admin())
  );
