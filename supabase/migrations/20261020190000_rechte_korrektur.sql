-- Korrektur zu 20261020180000_rechte (gefunden beim Testen):
-- Das Recht „Archivierte Projekte ansehen“ muss für ALLE archivierten Projekte gelten, auch für eigene. Vorher reichte „Projekte ansehen“
-- aus, um archivierte Projekte weiter zu sehen, obwohl das Archiv-Recht fehlte. Jetzt entscheidet bei einem archivierten Projekt allein
-- das Archiv-Recht, bei einem aktiven allein „Projekte ansehen“.

create or replace function public.projekt_sicht(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.ist_archiviertes_projekt(p_project_id) then public.recht_ok('archiv_ansehen')
    else public.recht_ok('projekte_ansehen')
  end;
$$;

drop policy recht_projects_select on public.projects;
create policy recht_projects_select on public.projects as restrictive for select to authenticated
  using (case when archiviert_am is not null then (select public.recht_ok('archiv_ansehen')) else (select public.recht_ok('projekte_ansehen')) end);

drop policy recht_measurement_deductions_select on public.measurement_deductions;
create policy recht_measurement_deductions_select on public.measurement_deductions as restrictive for select to authenticated
  using (case when public.aufmass_im_archiv(measurement_id) then (select public.recht_ok('archiv_ansehen')) else (select public.recht_ok('projekte_ansehen')) end);
