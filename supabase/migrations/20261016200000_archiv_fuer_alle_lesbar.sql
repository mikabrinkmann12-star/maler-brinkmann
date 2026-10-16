-- =============================================================================
-- Archivierte Projekte sind für ALLE aktiven Nutzer lesbar (Mika, 16.10.2026)
--
-- Beispiel: Sebastian war allein auf der Baustelle, Christian muss nacharbeiten
-- und schaut nach, welche Farbe verwendet wurde, statt Sebastian anzurufen.
-- Gelesen werden darf: Projekt, Kunde (inkl. Telefon und Adresse), Team,
-- Notizen, Fotos (auch im Speicher), Material, Aufmaß.
-- NICHT freigegeben: Zeiten, Einsätze, Termine. Ändern darf weiterhin nur, wer
-- es vorher durfte (bei archivierten Projekten praktisch nur Büro/Admin).
-- Aktive Projekte bleiben unverändert auf Mitglieder beschränkt.
-- =============================================================================

create function public.ist_archiviertes_projekt(p_projekt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_projekt_id and p.archiviert_am is not null
  ) and public.ist_aktiv();
$$;

-- Gehört der Kontakt zu mindestens einem archivierten Projekt?
create function public.ist_kontakt_im_archiv(p_kontakt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.contact_id = p_kontakt_id and p.archiviert_am is not null
  ) and public.ist_aktiv();
$$;

create function public.aufmass_im_archiv(p_measurement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.measurements m
    join public.projects p on p.id = m.project_id
    where m.id = p_measurement_id and p.archiviert_am is not null
  ) and public.ist_aktiv();
$$;

revoke execute on function public.ist_archiviertes_projekt(uuid) from public, anon;
revoke execute on function public.ist_kontakt_im_archiv(uuid)    from public, anon;
revoke execute on function public.aufmass_im_archiv(uuid)        from public, anon;
grant  execute on function public.ist_archiviertes_projekt(uuid) to authenticated;
grant  execute on function public.ist_kontakt_im_archiv(uuid)    to authenticated;
grant  execute on function public.aufmass_im_archiv(uuid)        to authenticated;

-- Zusätzliche (OR-verknüpfte) Lese-Regeln; die bestehenden bleiben unverändert.
create policy projects_lesen_archiv on public.projects
  for select to authenticated
  using (archiviert_am is not null and (select public.ist_aktiv()));

create policy contacts_lesen_archiv on public.contacts
  for select to authenticated
  using (public.ist_kontakt_im_archiv(id));

create policy project_members_lesen_archiv on public.project_members
  for select to authenticated
  using (public.ist_archiviertes_projekt(project_id));

create policy project_notes_lesen_archiv on public.project_notes
  for select to authenticated using (public.ist_archiviertes_projekt(project_id));
create policy project_photos_lesen_archiv on public.project_photos
  for select to authenticated using (public.ist_archiviertes_projekt(project_id));
create policy material_usage_lesen_archiv on public.material_usage
  for select to authenticated using (public.ist_archiviertes_projekt(project_id));
create policy measurements_lesen_archiv on public.measurements
  for select to authenticated using (public.ist_archiviertes_projekt(project_id));
create policy measurement_deductions_lesen_archiv on public.measurement_deductions
  for select to authenticated using (public.aufmass_im_archiv(measurement_id));

-- Fotos im privaten Speicher: Ordner = Projekt-ID
create policy projektfotos_lesen_archiv on storage.objects
  for select to authenticated
  using (
    bucket_id = 'projektfotos'
    and public.ist_archiviertes_projekt(public.projekt_aus_pfad(name))
  );
