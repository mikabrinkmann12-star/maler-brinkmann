// Mitarbeiter-Filter bei den Einsätzen (auch im Browser nutzbar).
// Ein Mitarbeiter sieht nur seine eigenen Einsätze samt Team im selben Auto. Der Filter wählt, zu wessen
// Einsätzen er gerade die Karten sehen will: zu seinen eigenen und/oder zu denen seiner Teamkollegen des Tages.

export type EinsatzPerson = { id: string; vorname: string; nachname: string };
type MitTeam = { assignment_members: { user_id: string }[] };

function name(p: EinsatzPerson): string {
  return `${p.vorname} ${p.nachname}`.trim();
}

/** Wer im Filter angeboten wird: ich (zuerst) und alle, die an diesem Tag mit mir im Auto sitzen, nach Namen sortiert. */
export function filterPersonen(ich: EinsatzPerson, einsaetze: MitTeam[], kollegen: Map<string, EinsatzPerson>): EinsatzPerson[] {
  const ids = new Set<string>();
  for (const e of einsaetze) for (const m of e.assignment_members) if (m.user_id !== ich.id) ids.add(m.user_id);
  const andere = [...ids]
    .map((id) => kollegen.get(id))
    .filter((k): k is EinsatzPerson => Boolean(k))
    .sort((a, b) => name(a).localeCompare(name(b), "de"));
  return [ich, ...andere];
}

/** Gewählte Personen aus `?personen=a,b`: nur erlaubte, ohne Doppelte, in der Reihenfolge der Liste. Ohne gültige Wahl: nur ich. */
export function gewaehltePersonen(param: string | string[] | undefined, erlaubt: EinsatzPerson[], ichId: string): string[] {
  const roh = (Array.isArray(param) ? param.join(",") : (param ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
  if (roh.length === 0) return [ichId];
  const gewaehlt = erlaubt.filter((p) => roh.includes(p.id)).map((p) => p.id);
  return gewaehlt.length ? gewaehlt : [ichId];
}

/** Wert für `?personen=`: bei „nur ich“ nichts (kürzere Adresse). */
export function personenParam(ids: string[], ichId: string): string | undefined {
  return ids.length === 1 && ids[0] === ichId ? undefined : ids.join(",");
}

/** Einsätze, in deren Team die Person steht. */
export function einsaetzeVon<T extends MitTeam>(einsaetze: T[], personId: string): T[] {
  return einsaetze.filter((e) => e.assignment_members.some((m) => m.user_id === personId));
}
