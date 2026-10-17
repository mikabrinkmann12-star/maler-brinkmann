-- E-Rechnung (Mika, 18.10.2026): Leitweg-ID beim Kunden (Behörden/Gemeinden verlangen XRechnung mit Leitweg-ID) und
-- die Original-Datei der Rechnung (XML bei XRechnung, PDF mit eingebetteten Daten bei ZUGFeRD) im Rechnungs-Bucket.
alter table public.contacts
  add column leitweg_id text check (leitweg_id is null or (length(leitweg_id) between 5 and 46 and leitweg_id ~ '^[0-9A-Za-z-]+$'));

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml']
 where id = 'rechnungen';
