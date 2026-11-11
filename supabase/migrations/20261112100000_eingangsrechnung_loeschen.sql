-- Eingangsrechnungen löschen (Mika, 11.11.2026): Der Postfach-Abruf legt manchmal Dinge ab, die gar keine Rechnung sind
-- (Werbung, Auftragsbestätigungen …). Die dürfen gelöscht werden – aber nur, solange sie noch „zu prüfen“ sind.
-- Bestätigte Rechnungen bleiben (Aufbewahrungspflicht) und werden weiterhin nur archiviert. Das Löschen steht im audit_log.

create policy incoming_invoices_loeschen on public.incoming_invoices for delete to authenticated
  using ((select public.ist_buero_oder_admin()) and zu_pruefen);

-- Die Datei dazu darf nur gelöscht werden, solange ihr Eintrag noch existiert und „zu prüfen“ ist (Datei zuerst, dann Eintrag).
create policy eingangsrechnungen_loeschen on storage.objects for delete to authenticated
  using (
    bucket_id = 'eingangsrechnungen'
    and (select public.ist_buero_oder_admin())
    and exists (select 1 from public.incoming_invoices i where i.storage_pfad = name and i.zu_pruefen)
  );
