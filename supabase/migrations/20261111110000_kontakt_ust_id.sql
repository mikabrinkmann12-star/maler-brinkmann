-- USt-IdNr. des Kunden (Mika, 11.11.2026): Plancraft druckt sie bei Firmenkunden mit Reverse-Charge (§ 13b UStG) unter die Anschrift,
-- die E-Rechnung (EN 16931, Kategorie AE) verlangt sie. Format: Ländercode + 2 bis 13 Zeichen, z. B. DE123456789; ohne Leerzeichen gespeichert.
alter table public.contacts
  add column ust_id text check (ust_id is null or ust_id ~ '^[A-Z]{2}[0-9A-Z+*.]{2,13}$');

comment on column public.contacts.ust_id is 'USt-IdNr. des Kunden (z. B. DE123456789), für Reverse-Charge-Rechnungen und E-Rechnung; leer = keine';
