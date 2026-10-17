-- Firmenlogo für Angebote (und später Rechnungs-Vorschau): privater Bucket, nur der Admin lädt hoch,
-- Büro und Admin lesen (das PDF wird auf dem Server mit den Rechten des Büros erzeugt).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmenlogo', 'firmenlogo', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy firmenlogo_lesen on storage.objects for select to authenticated
  using (bucket_id = 'firmenlogo' and (select public.ist_buero_oder_admin()));
create policy firmenlogo_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'firmenlogo' and (select public.ist_admin()));
create policy firmenlogo_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'firmenlogo' and (select public.ist_admin()));
