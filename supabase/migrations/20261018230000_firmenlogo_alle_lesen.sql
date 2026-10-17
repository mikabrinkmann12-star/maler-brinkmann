-- Das Firmenlogo darf jeder eingeloggte Nutzer sehen (Berichte als PDF, die auch Mitarbeiter erzeugen, tragen das Logo).
-- Hochladen und Entfernen bleibt beim Admin. Das Logo ist ohnehin auf jedem Briefbogen öffentlich.
drop policy firmenlogo_lesen on storage.objects;
create policy firmenlogo_lesen on storage.objects for select to authenticated
  using (bucket_id = 'firmenlogo');
