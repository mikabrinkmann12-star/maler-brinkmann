-- Firmendaten als Startwert (aus dem Plancraft-Angebot, Stand 17.10.2026).
-- Nur wenn noch nichts gespeichert ist; der Admin ändert sie unter Einstellungen → Firmendaten.
insert into public.app_settings (schluessel, wert)
values ('firma', jsonb_build_object(
  'name', 'Maler Betrieb Brinkmann',
  'inhaber', 'Ralf Brinkmann',
  'strasse', 'Zur Ziegelei 18',
  'plz', '26683',
  'ort', 'Saterland',
  'telefon', '04492/708108',
  'email', 'info@maler-brinkmann.de',
  'website', '',
  'ustid', 'DE292718369',
  'steuernummer', '56/106/09816',
  'bank', 'Raiffeisenbank eG Scharrel',
  'iban', 'DE74280652860401694705',
  'bic', 'GENODEF1SAN'
))
on conflict (schluessel) do nothing;
