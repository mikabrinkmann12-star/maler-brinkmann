-- =============================================================================
-- Phase 1.2: Pro Tag und Auto gibt es höchstens einen Einsatz.
-- (Einsätze ohne Firmenwagen – vehicle_id null – sind davon ausgenommen.)
-- =============================================================================

create unique index assignments_datum_fahrzeug_eindeutig
  on public.assignments (datum, vehicle_id)
  where vehicle_id is not null;
