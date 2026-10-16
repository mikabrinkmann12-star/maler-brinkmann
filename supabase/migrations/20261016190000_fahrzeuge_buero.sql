-- Fahrzeuge dürfen auch vom Büro angelegt und geändert werden (Mika, 16.10.2026),
-- damit in der Einteilung direkt ein neues Auto mit Kennzeichen hinzugefügt werden kann.
-- Lesen dürfen weiterhin alle aktiven Nutzer, gelöscht wird nie.

drop policy vehicles_anlegen on public.vehicles;
drop policy vehicles_aendern on public.vehicles;

create policy vehicles_anlegen on public.vehicles
  for insert to authenticated
  with check ((select public.ist_buero_oder_admin()));

create policy vehicles_aendern on public.vehicles
  for update to authenticated
  using ((select public.ist_buero_oder_admin()))
  with check ((select public.ist_buero_oder_admin()));
