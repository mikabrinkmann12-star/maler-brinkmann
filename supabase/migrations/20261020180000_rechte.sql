-- Rechte pro Rolle frei einstellbar (Mika, 20.10.2026): „Rollen & Zugriffsrechte“ kann der Admin ändern.
--
-- Aufbau (ändert KEINE bestehende Regel, die Voreinstellung ist genau das Verhalten von vorher):
--   * Tabelle role_permissions: je Rolle (Büro, Mitarbeiter) und Recht eine Stufe: nein / eigene / ja.
--     Der Admin hat immer alles und steht nicht in der Tabelle. Unbekannte Rechte gelten für Nicht-Admins als „nein“.
--   * Funktionen recht_stufe() / recht_ok() / hat_recht().
--   * WEGNEHMEN: zusätzliche RESTRICTIVE-Regeln. Sie gelten immer UND zu den bestehenden Regeln und können Zugriff nur
--     einschränken, nie erweitern. Stehen alle Rechte auf der Voreinstellung, ändert sich nichts.
--   * VERLEIHEN (nur Büro): neue PERMISSIVE-Regeln für Rechte, die bisher nur der Admin hat (Urlaub genehmigen,
--     Kalkulation ändern, Firmeneinstellungen). Mitarbeiter können diese Rechte nie bekommen (CHECK).
--   * Nicht einstellbar und immer nur Admin: Nutzerverwaltung, Rollen/Rechte selbst, Arbeitszeit-Konten (profiles), API-Schlüssel.

create table public.role_permissions (
  id         uuid primary key default gen_random_uuid(),
  rolle      public.app_rolle not null,
  recht      text not null,
  stufe      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) default auth.uid(),
  unique (rolle, recht),
  constraint role_permissions_rolle_check check (rolle <> 'admin'),
  constraint role_permissions_stufe_check check (stufe in ('nein', 'eigene', 'ja')),
  constraint role_permissions_buero_stufe_check check (not (rolle = 'buero' and stufe = 'eigene')),
  constraint role_permissions_recht_check check (recht in (
'projekte_ansehen',
    'archiv_ansehen',
    'projekte_bearbeiten',
    'kollegen_hinzufuegen',
    'kontakte_ansehen',
    'kontakte_bearbeiten',
    'kontakte_importieren',
    'baustelle_eintragen',
    'chat',
    'berichte',
    'anweisungen_ansehen',
    'einteilung_bearbeiten',
    'einsaetze_ansehen',
    'termine',
    'container_melden',
    'container_verwalten',
    'zeiten_eigene',
    'zeiten_fuer_kollegen',
    'zeiten_alle',
    'urlaub_beantragen',
    'urlaub_genehmigen',
    'katalog',
    'katalog_importieren',
    'angebote',
    'rechnungen',
    'eingangsrechnungen',
    'kalkulation_ansehen',
    'kalkulation_aendern',
    'buero_zugang',
    'einstellungen_firma')),
  constraint role_permissions_verleih_check check (
    not (rolle = 'mitarbeiter' and stufe <> 'nein' and recht in ('urlaub_genehmigen', 'kalkulation_aendern', 'einstellungen_firma', 'kontakte_importieren', 'katalog_importieren'))
  )
);

create trigger role_permissions_updated_at
  before update on public.role_permissions
  for each row execute function public.setze_updated_at();
create trigger role_permissions_audit
  after insert or update or delete on public.role_permissions
  for each row execute function public.protokolliere_aenderung();

alter table public.role_permissions enable row level security;
revoke truncate on public.role_permissions from anon, authenticated;

create policy role_permissions_lesen on public.role_permissions
  for select to authenticated using ((select public.ist_aktiv()));
create policy role_permissions_anlegen on public.role_permissions
  for insert to authenticated with check ((select public.ist_admin()));
create policy role_permissions_aendern on public.role_permissions
  for update to authenticated using ((select public.ist_admin())) with check ((select public.ist_admin()));
-- Kein DELETE.

-- Voreinstellung = bisheriges Verhalten
insert into public.role_permissions (rolle, recht, stufe, updated_by) values
  ('buero', 'projekte_ansehen', 'ja', null),
  ('mitarbeiter', 'projekte_ansehen', 'eigene', null),
  ('buero', 'archiv_ansehen', 'ja', null),
  ('mitarbeiter', 'archiv_ansehen', 'ja', null),
  ('buero', 'projekte_bearbeiten', 'ja', null),
  ('mitarbeiter', 'projekte_bearbeiten', 'nein', null),
  ('buero', 'kollegen_hinzufuegen', 'ja', null),
  ('mitarbeiter', 'kollegen_hinzufuegen', 'eigene', null),
  ('buero', 'kontakte_ansehen', 'ja', null),
  ('mitarbeiter', 'kontakte_ansehen', 'eigene', null),
  ('buero', 'kontakte_bearbeiten', 'ja', null),
  ('mitarbeiter', 'kontakte_bearbeiten', 'nein', null),
  ('buero', 'kontakte_importieren', 'nein', null),
  ('mitarbeiter', 'kontakte_importieren', 'nein', null),
  ('buero', 'baustelle_eintragen', 'ja', null),
  ('mitarbeiter', 'baustelle_eintragen', 'eigene', null),
  ('buero', 'chat', 'ja', null),
  ('mitarbeiter', 'chat', 'eigene', null),
  ('buero', 'berichte', 'ja', null),
  ('mitarbeiter', 'berichte', 'eigene', null),
  ('buero', 'anweisungen_ansehen', 'ja', null),
  ('mitarbeiter', 'anweisungen_ansehen', 'eigene', null),
  ('buero', 'einteilung_bearbeiten', 'ja', null),
  ('mitarbeiter', 'einteilung_bearbeiten', 'nein', null),
  ('buero', 'einsaetze_ansehen', 'ja', null),
  ('mitarbeiter', 'einsaetze_ansehen', 'eigene', null),
  ('buero', 'termine', 'ja', null),
  ('mitarbeiter', 'termine', 'eigene', null),
  ('buero', 'container_melden', 'ja', null),
  ('mitarbeiter', 'container_melden', 'ja', null),
  ('buero', 'container_verwalten', 'ja', null),
  ('mitarbeiter', 'container_verwalten', 'nein', null),
  ('buero', 'zeiten_eigene', 'ja', null),
  ('mitarbeiter', 'zeiten_eigene', 'eigene', null),
  ('buero', 'zeiten_fuer_kollegen', 'ja', null),
  ('mitarbeiter', 'zeiten_fuer_kollegen', 'eigene', null),
  ('buero', 'zeiten_alle', 'ja', null),
  ('mitarbeiter', 'zeiten_alle', 'nein', null),
  ('buero', 'urlaub_beantragen', 'ja', null),
  ('mitarbeiter', 'urlaub_beantragen', 'eigene', null),
  ('buero', 'urlaub_genehmigen', 'nein', null),
  ('mitarbeiter', 'urlaub_genehmigen', 'nein', null),
  ('buero', 'katalog', 'ja', null),
  ('mitarbeiter', 'katalog', 'nein', null),
  ('buero', 'katalog_importieren', 'nein', null),
  ('mitarbeiter', 'katalog_importieren', 'nein', null),
  ('buero', 'angebote', 'ja', null),
  ('mitarbeiter', 'angebote', 'nein', null),
  ('buero', 'rechnungen', 'ja', null),
  ('mitarbeiter', 'rechnungen', 'nein', null),
  ('buero', 'eingangsrechnungen', 'ja', null),
  ('mitarbeiter', 'eingangsrechnungen', 'nein', null),
  ('buero', 'kalkulation_ansehen', 'ja', null),
  ('mitarbeiter', 'kalkulation_ansehen', 'nein', null),
  ('buero', 'kalkulation_aendern', 'nein', null),
  ('mitarbeiter', 'kalkulation_aendern', 'nein', null),
  ('buero', 'buero_zugang', 'ja', null),
  ('mitarbeiter', 'buero_zugang', 'nein', null),
  ('buero', 'einstellungen_firma', 'nein', null),
  ('mitarbeiter', 'einstellungen_firma', 'nein', null);

-- -----------------------------------------------------------------------------
-- Funktionen
-- -----------------------------------------------------------------------------
-- Stufe des eingeloggten, aktiven Nutzers: Admin immer „ja“, sonst die Zeile seiner Rolle, ohne Zeile „nein“. Inaktiv: null.
create function public.recht_stufe(p_recht text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.rolle = 'admin' then 'ja'
    else coalesce(
      (select rp.stufe from public.role_permissions rp where rp.rolle = p.rolle and rp.recht = p_recht),
      'nein'
    )
  end
  from public.profiles p
  where p.id = (select auth.uid()) and p.aktiv;
$$;

-- „eigene“ oder „ja“: das Recht ist an (für Mitarbeiter ist „eigene“ der Normalfall: nur Eigenes bzw. eigene Projekte)
create function public.recht_ok(p_recht text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.recht_stufe(p_recht) in ('eigene', 'ja'), false);
$$;

-- nur „ja“ (volles Recht): wird für verliehene Rechte benutzt
create function public.hat_recht(p_recht text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.recht_stufe(p_recht) = 'ja', false);
$$;

-- Darf der Nutzer Projekt-Inhalte sehen? Normal oder, bei archivierten Projekten, über das Archiv-Recht.
create function public.projekt_sicht(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.recht_ok('projekte_ansehen')
    or (public.recht_ok('archiv_ansehen') and public.ist_archiviertes_projekt(p_project_id));
$$;

revoke execute on function public.recht_stufe(text), public.recht_ok(text), public.hat_recht(text), public.projekt_sicht(uuid) from public, anon;
grant execute on function public.recht_stufe(text), public.recht_ok(text), public.hat_recht(text), public.projekt_sicht(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- WEGNEHMEN: restriktive Regeln (gelten zusätzlich zu den bestehenden)
-- -----------------------------------------------------------------------------

-- Projekte ansehen (und Archiv ansehen)
create policy recht_projects_select on public.projects as restrictive for select to authenticated
  using ((select public.recht_ok('projekte_ansehen')) or (archiviert_am is not null and (select public.recht_ok('archiv_ansehen'))));
create policy recht_project_members_select on public.project_members as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_project_notes_select on public.project_notes as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_project_photos_select on public.project_photos as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_project_files_select on public.project_files as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_material_usage_select on public.material_usage as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_measurements_select on public.measurements as restrictive for select to authenticated
  using ((select public.projekt_sicht(project_id)));
create policy recht_measurement_deductions_select on public.measurement_deductions as restrictive for select to authenticated
  using ((select public.recht_ok('projekte_ansehen')) or ((select public.recht_ok('archiv_ansehen')) and public.aufmass_im_archiv(measurement_id)));
create policy recht_contacts_select on public.contacts as restrictive for select to authenticated
  using ((select public.recht_ok('kontakte_ansehen')) or ((select public.recht_ok('archiv_ansehen')) and public.ist_kontakt_im_archiv(id)));
-- Chat und Berichte sind für archivierte Projekte nur für Büro/Admin lesbar; hier gilt das Recht auf das Projekt selbst
create policy recht_project_messages_all on public.project_messages as restrictive for all to authenticated
  using ((select public.recht_ok('chat')))
  with check ((select public.recht_ok('chat')));
create policy recht_chat_reads_all on public.chat_reads as restrictive for all to authenticated
  using ((select public.recht_ok('chat')))
  with check ((select public.recht_ok('chat')));
create policy recht_project_reports_all on public.project_reports as restrictive for all to authenticated
  using ((select public.recht_ok('berichte')))
  with check ((select public.recht_ok('berichte')));
-- Projekte anlegen/bearbeiten/archivieren
create policy recht_projects_insert on public.projects as restrictive for insert to authenticated
  with check ((select public.recht_ok('projekte_bearbeiten')));
create policy recht_projects_update on public.projects as restrictive for update to authenticated
  using ((select public.recht_ok('projekte_bearbeiten')))
  with check ((select public.recht_ok('projekte_bearbeiten')));
-- Kollegen zu Projekten hinzufügen/entfernen
create policy recht_project_members_insert on public.project_members as restrictive for insert to authenticated
  with check ((select public.recht_ok('kollegen_hinzufuegen')));
create policy recht_project_members_delete on public.project_members as restrictive for delete to authenticated
  using ((select public.recht_ok('kollegen_hinzufuegen')));
-- Kontakte bearbeiten
create policy recht_contacts_insert on public.contacts as restrictive for insert to authenticated
  with check ((select public.recht_ok('kontakte_bearbeiten')));
create policy recht_contacts_update on public.contacts as restrictive for update to authenticated
  using ((select public.recht_ok('kontakte_bearbeiten')))
  with check ((select public.recht_ok('kontakte_bearbeiten')));
-- Baustelle: Fotos, Dateien, Notizen, Material, Aufmaß eintragen
create policy recht_project_photos_insert on public.project_photos as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_project_photos_update on public.project_photos as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_project_files_insert on public.project_files as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_project_files_update on public.project_files as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_project_notes_insert on public.project_notes as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_project_notes_update on public.project_notes as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_material_usage_insert on public.material_usage as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_material_usage_update on public.material_usage as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_measurements_insert on public.measurements as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_measurements_update on public.measurements as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_measurement_deductions_insert on public.measurement_deductions as restrictive for insert to authenticated
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_measurement_deductions_update on public.measurement_deductions as restrictive for update to authenticated
  using ((select public.recht_ok('baustelle_eintragen')))
  with check ((select public.recht_ok('baustelle_eintragen')));
create policy recht_measurement_deductions_delete on public.measurement_deductions as restrictive for delete to authenticated
  using ((select public.recht_ok('baustelle_eintragen')));
-- Arbeitsanweisung/Materialliste: lesen (Anweisungen) und schreiben (Angebote)
create policy recht_work_instructions_select on public.work_instructions as restrictive for select to authenticated
  using ((select public.recht_ok('anweisungen_ansehen')));
create policy recht_work_instructions_insert on public.work_instructions as restrictive for insert to authenticated
  with check ((select public.recht_ok('angebote')));
create policy recht_work_instructions_update on public.work_instructions as restrictive for update to authenticated
  using ((select public.recht_ok('angebote')))
  with check ((select public.recht_ok('angebote')));
-- Einteilung bearbeiten / Einsätze ansehen / Termine
create policy recht_assignments_select on public.assignments as restrictive for select to authenticated
  using ((select public.recht_ok('einsaetze_ansehen')) or (select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignments_insert on public.assignments as restrictive for insert to authenticated
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignments_update on public.assignments as restrictive for update to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')))
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignments_delete on public.assignments as restrictive for delete to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_members_select on public.assignment_members as restrictive for select to authenticated
  using ((select public.recht_ok('einsaetze_ansehen')) or (select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_members_insert on public.assignment_members as restrictive for insert to authenticated
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_members_update on public.assignment_members as restrictive for update to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')))
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_members_delete on public.assignment_members as restrictive for delete to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_stops_select on public.assignment_stops as restrictive for select to authenticated
  using ((select public.recht_ok('einsaetze_ansehen')) or (select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_stops_insert on public.assignment_stops as restrictive for insert to authenticated
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_stops_update on public.assignment_stops as restrictive for update to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')))
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_assignment_stops_delete on public.assignment_stops as restrictive for delete to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_vehicles_insert on public.vehicles as restrictive for insert to authenticated
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_vehicles_update on public.vehicles as restrictive for update to authenticated
  using ((select public.recht_ok('einteilung_bearbeiten')))
  with check ((select public.recht_ok('einteilung_bearbeiten')));
create policy recht_appointments_all on public.appointments as restrictive for all to authenticated
  using ((select public.recht_ok('termine')))
  with check ((select public.recht_ok('termine')));
create policy recht_appointment_members_all on public.appointment_members as restrictive for all to authenticated
  using ((select public.recht_ok('termine')))
  with check ((select public.recht_ok('termine')));
-- Container melden / verwalten
create policy recht_container_requests_insert on public.container_requests as restrictive for insert to authenticated
  with check ((select public.recht_ok('container_melden')));
create policy recht_container_requests_update on public.container_requests as restrictive for update to authenticated
  using ((select public.recht_ok('container_verwalten')))
  with check ((select public.recht_ok('container_verwalten')));
-- Zeiten
-- eigene = Zeilen, die dem Nutzer gehören oder die er selbst eingetragen hat; alle = Büro-Recht für fremde Zeiten
create policy recht_time_entries_select on public.time_entries as restrictive for select to authenticated
  using (((user_id = (select auth.uid()) or erstellt_von = (select auth.uid())) and (select public.recht_ok('zeiten_eigene'))) or ((select public.ist_buero_oder_admin()) and (select public.recht_ok('zeiten_alle'))));
create policy recht_time_entries_insert on public.time_entries as restrictive for insert to authenticated
  with check ((user_id = (select auth.uid()) and (select public.recht_ok('zeiten_eigene'))) or (user_id <> (select auth.uid()) and (((select public.ist_buero_oder_admin()) and (select public.recht_ok('zeiten_alle'))) or (not (select public.ist_buero_oder_admin()) and (select public.recht_ok('zeiten_fuer_kollegen'))))));
create policy recht_time_entries_update on public.time_entries as restrictive for update to authenticated
  using ((user_id = (select auth.uid()) and (select public.recht_ok('zeiten_eigene'))) or ((select public.ist_buero_oder_admin()) and (select public.recht_ok('zeiten_alle'))))
  with check ((user_id = (select auth.uid()) and (select public.recht_ok('zeiten_eigene'))) or ((select public.ist_buero_oder_admin()) and (select public.recht_ok('zeiten_alle'))));
create policy recht_stempeluhr_all on public.stempeluhr as restrictive for all to authenticated
  using ((select public.recht_ok('zeiten_eigene')))
  with check ((select public.recht_ok('zeiten_eigene')));
-- Urlaub beantragen / genehmigen
create policy recht_leave_requests_insert on public.leave_requests as restrictive for insert to authenticated
  with check ((select public.recht_ok('urlaub_beantragen')));
create policy recht_leave_requests_update on public.leave_requests as restrictive for update to authenticated
  using ((select public.recht_ok('urlaub_beantragen')) or (select public.hat_recht('urlaub_genehmigen')))
  with check ((select public.recht_ok('urlaub_beantragen')) or (select public.hat_recht('urlaub_genehmigen')));
-- Katalog, Angebote, Rechnungen, Eingangsrechnungen, Kalkulation
create policy recht_catalog_folders_all on public.catalog_folders as restrictive for all to authenticated
  using ((select public.recht_ok('katalog')))
  with check ((select public.recht_ok('katalog')));
create policy recht_materials_all on public.materials as restrictive for all to authenticated
  using ((select public.recht_ok('katalog')))
  with check ((select public.recht_ok('katalog')));
create policy recht_services_all on public.services as restrictive for all to authenticated
  using ((select public.recht_ok('katalog')))
  with check ((select public.recht_ok('katalog')));
create policy recht_quotes_all on public.quotes as restrictive for all to authenticated
  using ((select public.recht_ok('angebote')))
  with check ((select public.recht_ok('angebote')));
create policy recht_quote_items_all on public.quote_items as restrictive for all to authenticated
  using ((select public.recht_ok('angebote')))
  with check ((select public.recht_ok('angebote')));
create policy recht_quote_shares_all on public.quote_shares as restrictive for all to authenticated
  using ((select public.recht_ok('angebote')))
  with check ((select public.recht_ok('angebote')));
create policy recht_text_templates_select on public.text_templates as restrictive for select to authenticated
  using ((select public.recht_ok('angebote')) or (select public.hat_recht('einstellungen_firma')));
create policy recht_invoices_all on public.invoices as restrictive for all to authenticated
  using ((select public.recht_ok('rechnungen')))
  with check ((select public.recht_ok('rechnungen')));
create policy recht_invoice_items_all on public.invoice_items as restrictive for all to authenticated
  using ((select public.recht_ok('rechnungen')))
  with check ((select public.recht_ok('rechnungen')));
create policy recht_invoice_reminders_all on public.invoice_reminders as restrictive for all to authenticated
  using ((select public.recht_ok('rechnungen')))
  with check ((select public.recht_ok('rechnungen')));
create policy recht_incoming_invoices_all on public.incoming_invoices as restrictive for all to authenticated
  using ((select public.recht_ok('eingangsrechnungen')))
  with check ((select public.recht_ok('eingangsrechnungen')));
create policy recht_kalkulation_einstellungen_select on public.kalkulation_einstellungen as restrictive for select to authenticated
  using ((select public.recht_ok('kalkulation_ansehen')) or (select public.hat_recht('kalkulation_aendern')));
-- Büro-Übersicht: Hinweise und Verlauf
create policy recht_notifications_all on public.notifications as restrictive for all to authenticated
  using ((select public.recht_ok('buero_zugang')))
  with check ((select public.recht_ok('buero_zugang')));
create policy recht_audit_log_select on public.audit_log as restrictive for select to authenticated
  using ((select public.recht_ok('buero_zugang')));
-- Dateien im Speicher (Buckets)
create policy recht_speicher_eingangsrechnungen on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'eingangsrechnungen' or (select public.recht_ok('eingangsrechnungen')))
  with check (bucket_id <> 'eingangsrechnungen' or (select public.recht_ok('eingangsrechnungen')));
create policy recht_speicher_rechnungen on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'rechnungen' or (select public.recht_ok('rechnungen')))
  with check (bucket_id <> 'rechnungen' or (select public.recht_ok('rechnungen')));
create policy recht_speicher_angebotsbilder on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'angebotsbilder' or (select public.recht_ok('angebote')))
  with check (bucket_id <> 'angebotsbilder' or (select public.recht_ok('angebote')));
create policy recht_speicher_berichtunterschriften on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'berichtunterschriften' or (select public.recht_ok('berichte')))
  with check (bucket_id <> 'berichtunterschriften' or (select public.recht_ok('berichte')));
create policy recht_speicher_projektfotos_lesen on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'projektfotos' or (select public.recht_ok('projekte_ansehen')) or (select public.recht_ok('archiv_ansehen')));
create policy recht_speicher_projektfotos_hochladen on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'projektfotos' or (select public.recht_ok('baustelle_eintragen')) or (select public.recht_ok('chat')));
create policy recht_speicher_projektdateien_lesen on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'projektdateien' or (select public.recht_ok('projekte_ansehen')) or (select public.recht_ok('archiv_ansehen')));
create policy recht_speicher_projektdateien_hochladen on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'projektdateien' or (select public.recht_ok('baustelle_eintragen')) or (select public.recht_ok('chat')));

-- -----------------------------------------------------------------------------
-- VERLEIHEN: neue erlaubende Regeln für Rechte, die bisher nur der Admin hat (nur Büro bekommt sie, siehe CHECK oben)
-- -----------------------------------------------------------------------------
create policy leave_requests_aendern_recht on public.leave_requests
  for update to authenticated
  using ((select public.hat_recht('urlaub_genehmigen'))) with check ((select public.hat_recht('urlaub_genehmigen')));

create policy kalkulation_aendern_recht on public.kalkulation_einstellungen
  for update to authenticated
  using ((select public.hat_recht('kalkulation_aendern'))) with check ((select public.hat_recht('kalkulation_aendern')));

create policy app_settings_aendern_recht on public.app_settings
  for update to authenticated
  using ((select public.hat_recht('einstellungen_firma'))) with check ((select public.hat_recht('einstellungen_firma')));
create policy app_settings_anlegen_recht on public.app_settings
  for insert to authenticated with check ((select public.hat_recht('einstellungen_firma')));

create policy text_templates_aendern_recht on public.text_templates
  for update to authenticated
  using ((select public.hat_recht('einstellungen_firma'))) with check ((select public.hat_recht('einstellungen_firma')));
create policy text_templates_anlegen_recht on public.text_templates
  for insert to authenticated with check ((select public.hat_recht('einstellungen_firma')));

create policy project_statuses_aendern_recht on public.project_statuses
  for update to authenticated
  using ((select public.hat_recht('einstellungen_firma'))) with check ((select public.hat_recht('einstellungen_firma')));
create policy project_statuses_anlegen_recht on public.project_statuses
  for insert to authenticated with check ((select public.hat_recht('einstellungen_firma')));

create policy firmenlogo_hochladen_recht on storage.objects
  for insert to authenticated with check (bucket_id = 'firmenlogo' and (select public.hat_recht('einstellungen_firma')));
create policy firmenlogo_loeschen_recht on storage.objects
  for delete to authenticated using (bucket_id = 'firmenlogo' and (select public.hat_recht('einstellungen_firma')));

-- Zugehörige Trigger: Entscheidung über Urlaub und Urlaubs-Buchungen auch mit dem verliehenen Recht
create or replace function public.urlaub_pruefen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.ist_admin() or public.hat_recht('urlaub_genehmigen') then
    if new.status in ('genehmigt', 'abgelehnt') and new.status is distinct from old.status then
      new.entschieden_von := (select auth.uid());
      new.entschieden_am := now();
    end if;
  else
    -- Alle anderen dürfen nicht entscheiden und keine Entscheidung verändern.
    if new.status in ('genehmigt', 'abgelehnt') then
      raise exception 'Urlaubsanträge kann nur genehmigen oder ablehnen, wer das Recht dazu hat.' using errcode = 'P0001';
    end if;
    new.antwort := old.antwort;
    new.entschieden_von := old.entschieden_von;
    new.entschieden_am := old.entschieden_am;
  end if;
  return new;
end;
$$;

create or replace function public.zeit_urlaub_schutz()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.leave_request_id is distinct from (case when tg_op = 'UPDATE' then old.leave_request_id end)
     and (select auth.uid()) is not null and not (public.ist_admin() or public.hat_recht('urlaub_genehmigen')) then
    raise exception 'Urlaubs-Buchungen legt nur die Genehmigung an.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

